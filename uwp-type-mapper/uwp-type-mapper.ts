"use strict";

import parse from "./uwp-type-parser"
import {
    TypeNotation,
    NamedTypeNotation,
    FunctionTypeNotation,
    DescribedKeyTypePair,
    FunctionSignature,
    DelegateTypeNotation,
    EventTypeNotation,
    NamespaceDocumentNotation,
    StructureTypeNotation,
    ClassTypeNotation,
    PropertyTypeNotation,
    InterfaceTypeNotation,
    LanguageTaggedContent
} from "./uwp-type-parser";
import {
    ClassDescription,
    TypeDescription,
    TypeNameOrDescription
} from "../uwp-type-iterator/iterator";
import * as fspromise from "./fspromise"

main().catch((err) => console.error(err));

interface ExtendedInterfaceTypeNotation extends InterfaceTypeNotation {
    extensions?: string[];
}

interface InterfaceLiteralTypeNotation extends NamedTypeNotation {
    type: "interfaceliteral"
    members: DescribedKeyTypePair[];
}

interface ExtendedFunctionSignature extends FunctionSignature {
    return: "instance" | TypeNotation | InterfaceLiteralTypeNotation;
}
interface ExtendedClassDescription extends ClassDescription {
    __eventTarget?: boolean;
    __staticEventTarget?: boolean;
    __constructor: FunctionDescription;
    __interfaces: string[];
}

interface FunctionDescription extends TypeDescription { __type: "function"; __signatures: ExtendedFunctionSignature[]; }
interface EventDescription extends TypeDescription { __type: "event"; __delegate: string; }
interface DelegateDescription extends TypeDescription { __type: "delegate"; __signature: FunctionSignature; }
interface InterfaceDescription extends TypeDescription { __type: "interface"; __interfaces: string[]; __typeParameters: string[]; }
interface InterfaceLiteralDescription extends TypeDescription { __type: "interfaceliteral"; __members: DescribedKeyTypePair[]; }

class TypeReferenceMemory {
    static typeNameRegex = /[\w\.\:]+/g;

    memorySet = new Set<string>();
    private _nameMap: Map<string, string>;
    private _getExplicitLink: (typeName: string) => string;

    constructor(nameMap: Map<string, string>, getExplicitLink: (typeName: string) => string) {
        this._nameMap = nameMap;
        this._getExplicitLink = getExplicitLink;
    }

    memorizeReferenceInSignatures(signatures: FunctionSignature[]) {
        for (let signature of signatures) {
            this.memorizeReferenceInSignature(signature);
        }
        return signatures;
    }

    memorizeReferenceInSignature(signature: FunctionSignature) {
        for (let parameter of signature.parameters) {
            this.memorizeType(extractJSOrCppType(parameter.type));
        }
        if (signature.return && typeof signature.return !== "string") {
            this.memorizeType(extractJSOrCppType((signature.return as TypeNotation).type));
        }
        return signature;
    }

    memorizeReferencesFromKeyTypePairs(pairs: DescribedKeyTypePair[]) {
        for (let pair of pairs) {
            this.memorizeType(extractJSOrCppType(pair.type));
        }
        return pairs;
    }

    memorizeType(typeReference: string) {
        let matches = typeReference.match(TypeReferenceMemory.typeNameRegex);
        for (let match of matches) {
            let link = this._getExplicitLink(match);
            if (link != null) {
                continue; // linked interfaces should not appear
            }

            let lowerCase = match.toLowerCase();
            if (this._nameMap.has(lowerCase)) {
                match = this._nameMap.get(lowerCase);
            }
            this.memorySet.add(match);
        }
    }

}

async function main() {
    let args = parseArgs();
    if (!args["-i"]) {
        throw new Error("Input iteration file path is not specified.");
    }
    if (!args["-o"]) {
        throw new Error("Output file path is not specified.");
    }

    if (!(await fspromise.exists("supplies/prepend.d.ts"))) {
        throw new Error("Expected supplies/prepend.d.ts file but the path is not found");
    }
    if (!(await fspromise.exists("supplies/typelink.json"))) {
        throw new Error("Expected supplies/typelink.json file but the path is not found");
    }
    if (!(await fspromise.exists("supplies/genericlength.json"))) {
        throw new Error("Expected supplies/genericlength.json file but the path is not found");
    }
    let prepend = await fspromise.readFile("supplies/prepend.d.ts");
    let typelink = JSON.parse(await fspromise.readFile("supplies/typelink.json"));
    let typeParameterLengthMap = JSON.parse(await fspromise.readFile("supplies/genericlength.json"));

    await fspromise.writeFile("supplies/typelink.json", JSON.stringify(sortMembers(typelink), undefined, 4));
    await fspromise.writeFile("supplies/genericlength.json", JSON.stringify(sortMembers(typeParameterLengthMap), undefined, 4));

    console.log("Loading documentations...");
    let docs = await loadDocs("--force-reparse" in args)
    let nameMap = createNameResolutionMap(docs);
    console.log("Loading iteration file...");
    let iterations = JSON.parse(await fspromise.readFile(args["-i"]));

    console.log("Merging interface extensions...");
    mergeInterfaceExtensions(docs);

    console.log("Mapping...");
    map(iterations, docs, new TypeReferenceMemory(nameMap, typeName => typelink[typeName]));

    if (args["-mapout"]) {
        // for debugging purpose
        console.log("Storing mapped iteration file...");
        await fspromise.writeFile(args["-mapout"], JSON.stringify(iterations, null, 2));
    }

    console.log("Storing result d.ts file...");
    await fspromise.writeFile(args["-o"], prepend + "\r\n" + writeAsDTS(iterations, tryLinkType));

    console.log("Finished.");
    process.exit();

    function tryLinkType(typeName: string) {
        let typeNameRegex = /[\w\.\:]+/g;
        let remainingTypeParameterSyntaxRegex = /^<(.+)>$/;
        let interfaceMarkerRegex = /\.I([A-Z]\w+)/;
        // let requiredTypeParameterNotExistRegex = /IVectorView(?:,|>|$)/

        let references: string[] = [];
        let result = typeName.replace(typeNameRegex, (match) => {
            let lowerCase = match.toLowerCase();
            if (nameMap.has(lowerCase)) {
                match = nameMap.get(lowerCase);
                lowerCase = match.toLowerCase();
            }
            let linkedType = typelink[match];
            if (typeof linkedType === "string") {
                // force linking even if there is a document (for e.g. Windows.Foundation.TimeSpan)
                match = linkedType;
                lowerCase = linkedType.toLowerCase();
            }

            // TODO: code below is not always valid
            // Example: RandomAccessStream does not implement IRandomAccessStream

            //let doc = docs[lowerCase];
            //if (doc && doc.type !== "interface") {
            //    references.push(match);
            //    return match;
            //}
            //let interfaceMatch = match.match(interfaceMarkerRegex);
            //if (!interfaceMatch) {
            //    references.push(match);
            //    return match;
            //}
            //let valueName = match.replace(interfaceMarkerRegex, ".$1");
            //if (valueName.toLowerCase() in docs) {
            //    references.push(valueName);
            //    return valueName;
            //}
            references.push(match);
            return match;
        });

        let remainingGenericMatch = result.match(remainingTypeParameterSyntaxRegex);
        if (remainingGenericMatch) {
            // e.g. Windows.Foundation.IReference<Foo> -> <Foo> // remove <> here
            result = remainingGenericMatch[1];
        }

        for (let reference of references) {
            let doc = docs[reference.toLowerCase()] as TypeNotation;
            let typeParameterLength: number;
            if (doc && doc.type === "delegate") {
                let typeParameters = (doc as DelegateTypeNotation).signature.typeParameters;
                if (!typeParameters) {
                    continue;
                }
                typeParameterLength = typeParameters.length;
            }
            else {
                typeParameterLength = typeParameterLengthMap[reference];
                if (!typeParameterLength) {
                    continue;
                }
            }
            let genericCheckerRegex = new RegExp(`${reference}(?:,|>|$)`);
            let genericCheckerMatch = result.match(genericCheckerRegex);
            if (genericCheckerMatch) {
                let insertPosition = genericCheckerMatch.index + reference.length;
                result = `${result.slice(0, insertPosition)}${generateAnyTypeParameters(typeParameterLength)}${result.slice(insertPosition)}`;
            }
        }

        return result;
    }
    function createNameResolutionMap(docs: any) {
        /*
        automate name resolution instead of enumerating all of them in typelink
        TODO: docs
        */
        let shortNameRegex = /\.(\w+)$/;
        let map = new Map<string, string>();
        let duplications = new Set<string>();

        let names = Object.getOwnPropertyNames(docs);
        for (let name of names) {
            let match = name.match(shortNameRegex);
            if (!match) {
                continue;
            }
            let doc = docs[name] as NamedTypeNotation;
            if (doc.type !== "class" &&
                doc.type !== "delegate" &&
                doc.type !== "enumeration" &&
                doc.type !== "structure" &&
                doc.type !== "interface") {

                continue;
            }
            if (duplications.has(match[1])) {
                continue;
            }
            if (map.has(match[1])) {
                map.delete(match[1]);
                duplications.add(match[1]);
            };
            map.set(match[1], doc.camelId);
        }

        for (let duplication of duplications) {
            map.set(duplication, `any /* unmapped: ${duplication} */`);
        }
        return map;
    }
    function generateAnyTypeParameters(length: number) {
        let anys = new Array(length).fill("any /* unmapped */");
        return `<${anys.join(', ')}>`;
    }


    function sortMembers(object: any) {
        let temp = {} as any;
        for (let name of Object.getOwnPropertyNames(object).sort()) {
            temp[name] = object[name];
        }
        return temp;
    }
}

function mergeInterfaceExtensions(docs: any) {
    const lastNumber = /\d$/;
    //const log: string[] = [];

    for (const name of Object.getOwnPropertyNames(docs)) {
        const doc = docs[name] as ExtendedInterfaceTypeNotation;
        if (doc.type !== "interface") {
            continue;
        }
        if (name.match(lastNumber)) {
            // should be processed by base interface that has no number postfix
            continue;
        }

        let i = 2;
        const extensions: string[] = [];
        while (true) {
            let nextName = `${name}${i}`;
            let next = docs[nextName] as InterfaceTypeNotation;
            if (!next) {
                break;
            }
            if (next.type !== "interface") {
                throw new Error(`Expected 'interface' type notation but saw '${next.type}'`);
            }

            // TODO: use shortName rather than fullName (fullName never collides)
            for (const method of next.members.methods) {
                if (doc.members.methods.indexOf(method) !== -1) {
                    throw new Error(`Duplicate method ${method} on ${name}${i}`);
                }
            }
            for (const property of next.members.properties) {
                if (doc.members.properties.indexOf(property) !== -1) {
                    throw new Error(`Duplicate method ${property} on ${name}${i}`);
                }
            }

            extensions.push(nextName);
            /*
            TODO: add reference to extensions
            merging just members won't work as the full name will be different

            change name: windows.storage.istoragefolder2.method -> windows.storage.istoragefolder.method

            or add 'extensions' field on interface notation
            */ 

            i++;
        }
        if (extensions.length > 0) {
            //log.push(name);
            doc.extensions = extensions;
        }
    }
}

function map(parentIteration: TypeDescription, docs: any, referenceMemory: TypeReferenceMemory) {
    /*
    interface mapping?

    create a map 
    namespace -> structures -> map.set(structureName, namespace)
    create a set
    signatures -> map.set(typeName);

    for referenced typename: if map.has(typeName) then namespace[typeName] = interfaceLiteralDescription;
    */
    let genericsRegex = /<(.+)>$/;

    let nonValueTypeParentNamespaceMap = new Map<string, TypeDescription>();
    referenceMemory.memorySet.add("Windows.Foundation.EventHandler"); // documents reference this incorrectly
    //typeReferenceSet.add("Windows.Foundation.AsyncActionProgressHandler"); // only referenced from interfaces
    //typeReferenceSet.add("Windows.Foundation.AsyncActionWithProgressCompletedHandler"); // only referenced from interfaces
    mapItem(parentIteration);

    function mapItem(iteration: TypeDescription) {
        for (let itemName in iteration) {
            if ((itemName as string).startsWith("__")) {
                continue;
            }

            let item = iteration[itemName] as TypeNameOrDescription;
            if (typeof item === "string") {
                let fullName = `${iteration.__fullname}.${itemName}`;

                let doc = docs[fullName.toLowerCase()] as NamedTypeNotation;
                if (!doc) {
                    continue;
                }

                iteration[itemName] = getMemberDescription(doc, itemName, fullName);
            }
            else {
                let fullName = item.__fullname;
                let doc = docs[fullName.toLowerCase()] as NamedTypeNotation;
                if (doc) {
                    item.__description = doc.description;
                }

                if (item.__type === "structure") {
                    if (doc) {
                        if (doc.type === "enumeration") {
                            item.__type = doc.type;
                        }
                        else if (doc.type === "namespace") {
                            item.__type = doc.type;
                            for (let structure of (doc as NamespaceDocumentNotation).members.structures) {
                                nonValueTypeParentNamespaceMap.set(structure, item);
                            }
                            for (let delegate of (doc as NamespaceDocumentNotation).members.delegates) {
                                nonValueTypeParentNamespaceMap.set(delegate, item);
                            }
                            for (let interf of (doc as NamespaceDocumentNotation).members.interfaces) {
                                nonValueTypeParentNamespaceMap.set(interf, item);
                            }
                            // TODO: interface (parser should get them)
                        }
                    }
                    mapItem(item);
                }
                else if (item.__type === "class") {
                    if (doc) {
                        if (doc.type === "attribute") {
                            item.__type = doc.type;
                        }
                        else if (doc.type === "class") {
                            (item as ExtendedClassDescription).__interfaces = (doc as ClassTypeNotation).interfaces;
                        }
                    }
                    mapItem(item);


                    let ctorFullName = `${fullName}.constructor`;
                    let ctorDoc = docs[ctorFullName.toLowerCase()] as FunctionTypeNotation;
                    if (ctorDoc) {
                        item["__constructor"] = {
                            __fullname: ctorFullName,
                            __description: ctorDoc.description,
                            __type: "function",
                            __signatures: referenceMemory.memorizeReferenceInSignatures(ctorDoc.signatures)
                        } as FunctionDescription;
                    }

                    if (hasEventCallback((item as ExtendedClassDescription).prototype)) {
                        (item as ExtendedClassDescription).__eventTarget = true;
                        delete (item as ExtendedClassDescription).prototype["addEventListener"];
                        delete (item as ExtendedClassDescription).prototype["removeEventListener"];
                    }
                    if (hasEventCallback((item as ExtendedClassDescription))) {
                        (item as ExtendedClassDescription).__staticEventTarget = true;
                        delete (item as ExtendedClassDescription)["addEventListener"];
                        delete (item as ExtendedClassDescription)["removeEventListener"];
                    }
                }
            }
        }
    }

    // register types that are referenced by methods/properties at least once
    for (let typeReference of referenceMemory.memorySet) {
        let doc = docs[typeReference.toLowerCase()] as TypeNotation;
        if (!doc) {
            continue;
        }
        let parentNamespace = nonValueTypeParentNamespaceMap.get(typeReference);
        if (!parentNamespace) {
            continue;
        }
        if (doc.type === "structure") {
            parentNamespace[getShortName(typeReference)] = {
                __fullname: typeReference,
                __description: doc.description,
                __type: "interfaceliteral",
                __members: referenceMemory.memorizeReferencesFromKeyTypePairs((doc as StructureTypeNotation).members)
            } as InterfaceLiteralDescription;
        }
        else if (doc.type === "delegate") {
            parentNamespace[getShortName(typeReference)] = {
                __fullname: typeReference,
                __description: doc.description,
                __type: "delegate",
                __signature: referenceMemory.memorizeReferenceInSignature((doc as DelegateTypeNotation).signature)
            } as DelegateDescription;
        }
        else if (doc.type === "interface") {
            parentNamespace[getShortName(typeReference)] = getInterfaceDescription(typeReference, doc as ExtendedInterfaceTypeNotation);
        }
    }

    function getInterfaceDescription(fullname: string, doc: ExtendedInterfaceTypeNotation) {
        let interfaces = (doc as InterfaceTypeNotation).interfaces;
        for (let interf of interfaces) {
            referenceMemory.memorizeType(interf);
        }

        let description: InterfaceDescription = {
            __fullname: fullname,
            __description: doc.description,
            __type: "interface",
            __interfaces: interfaces,
            __typeParameters: (doc as InterfaceTypeNotation).typeParameters
        };

        let members = (doc as InterfaceTypeNotation).members;
        for (let method of members.methods) {
            let shortName = getShortName(method);
            shortName = `${shortName.slice(0, 1).toLowerCase()}${shortName.slice(1)}`;
            let doc = docs[method.toLowerCase()] as FunctionTypeNotation;
            if (!doc) {
                description[shortName] = "unknown";
                continue;
            }
            if (doc.type !== "function") {
                throw new Error(`Expected function type documentation but found ${doc.type}`);
            }
            description[shortName] = getMemberDescription(doc, shortName, method);
        }
        for (let property of members.properties) {
            let shortName = getShortName(property);
            shortName = `${shortName.slice(0, 1).toLowerCase()}${shortName.slice(1)}`;
            let doc = docs[property.toLowerCase()] as PropertyTypeNotation;
            if (!doc) {
                description[shortName] = "unknown";
                continue;
            }
            if (doc.type !== "property") {
                throw new Error(`Expected property type documentation but found ${doc.type}`);
            }
            description[shortName] = getMemberDescription(doc, shortName, property);
        }

        if (doc.extensions) {
            for (const extensionName of doc.extensions) {
                const extension = docs[extensionName] as ExtendedInterfaceTypeNotation;
                if (extension.type !== "interface") {
                    throw new Error(`Expected 'interface' type but saw ${extension.type}`);
                }
                const extensionDescription = getInterfaceDescription(extensionName, extension);
                for (const key of Object.getOwnPropertyNames(extensionDescription)) {
                    if (key.startsWith("__")) {
                        continue;
                    }
                    if (description[key]) {
                        const originalMemberDescription = description[key] as FunctionDescription;
                        const extensionMemberDescription = extensionDescription[key] as FunctionDescription;
                        if (originalMemberDescription.__type !== "function" || extensionMemberDescription.__type !== "function") {
                            throw new Error(`Expected two 'function' types but saw ${originalMemberDescription.__type} + ${extensionMemberDescription.__type}`);
                        }
                        originalMemberDescription.__signatures.push(...extensionMemberDescription.__signatures);
                    }
                    else {
                        description[key] = extensionDescription[key];
                    }
                }
            }
        }

        return description;
    }

    /**
     * Note: this automatically remembers referenced types inside notations
     */
    function getMemberDescription(doc: TypeNotation, itemName: string, fullName: string) {
        switch (doc.type) {
            case "function":
                /*
                TODO: interfaces from parser and iterator are too different, should be integrated
                */
                return {
                    __fullname: fullName,
                    __type: "function",
                    __description: doc.description,
                    __signatures: referenceMemory.memorizeReferenceInSignatures((doc as FunctionTypeNotation).signatures)
                } as FunctionDescription;
            case "event":
                let delegateType = extractJSOrCppType((doc as EventTypeNotation).delegate);
                referenceMemory.memorizeType(delegateType);
                return {
                    __fullname: fullName,
                    __type: "event",
                    __description: doc.description,
                    __delegate: extractJSOrCppType(delegateType)
                } as EventDescription;
            case "property": {
                let propertyType = extractJSOrCppType((doc as PropertyTypeNotation).name);
                referenceMemory.memorizeType(propertyType);
                return {
                    __fullname: fullName,
                    __type: propertyType, /* TODO: "property" */
                    __description: doc.description
                } as TypeDescription;
            }
            default: {
                throw new Error(`Unexpected document type: ${doc.type}`);
            }
        }
    }

    function hasEventCallback(iteration: TypeDescription) {
        for (let itemName in iteration) {
            if ((itemName as string).startsWith("__")) {
                continue;
            }
            let item = iteration[itemName] as TypeNameOrDescription;
            if ((item as TypeDescription).__type === "event") {
                return true;
            }
        }
        return false;
    }

    function getShortName(longName: string) {
        let split = longName.split('.');
        if (split.length < 2) {
            throw new Error(`Expected dot notation but not found: ${longName}`);
        }
        return split[split.length - 1];
    }
}

function writeAsDTS(baseIteration: TypeDescription, typeLinker: (typeName: string) => string) {
    let stack: TypeDescription[] = [];
    let indentBase = "    ";
    return "declare " + write(0, baseIteration, baseIteration.__fullname);

    function write(indentRepeat: number, iteration: TypeNameOrDescription, iterationName: string) {
        let initialIndent = repeatIndent(indentBase, indentRepeat);
        let nextLevelIndent = initialIndent + indentBase;

        if (typeof iteration === "string") {
            if (iteration === "unknown") {
                return `${initialIndent}var ${iterationName}: any; /* unmapped type */\r\n`;
            }
            else if (iteration === "undefined") {
                return `${initialIndent}var ${iterationName}: void;\r\n`;
            }
            //else {
            //    throw new Error("Unexpected iteration type");
            //}
        }
        else if (iteration.__type === "structure" || iteration.__type === "namespace") {
            let result = `${initialIndent}namespace ${iterationName} {\r\n`
            for (let itemName in iteration) {
                if ((itemName as string).startsWith("__")) {
                    continue;
                }
                result += write(indentRepeat + 1, iteration[itemName], itemName);
            }
            result += `${initialIndent}}\r\n`;
            if (iteration.__description) {
                result = `${initialIndent}/** ${iteration.__description} */\r\n${result}`;
            }
            return result;
        }
        else if (iteration.__type === "enumeration") {
            let result = `${initialIndent}enum ${iterationName} {\r\n`;
            for (let itemName in iteration) {
                if ((itemName as string).startsWith("__")) {
                    continue;
                }
                let item = iteration[itemName] as TypeDescription;
                if (item.__description) {
                    result += `${nextLevelIndent}/** ${item.__description} */\r\n`;
                }
                result += `${nextLevelIndent}${itemName},\r\n`;
            }
            result += `${initialIndent}}\r\n`;
            if (iteration.__description) {
                result = `${initialIndent}/** ${iteration.__description} */\r\n${result}`;
            }
            return result;
        }
        else if (iteration.__type === "class") {
            return `${writeClass(indentRepeat, iteration as ExtendedClassDescription, iterationName)}\r\n`;
        }
        else if (iteration.__type === "attribute") {
            return `${writeClass(indentRepeat, iteration as ExtendedClassDescription, iterationName, true)}\r\n`;
        }
        else if (iteration.__type === "interfaceliteral") {
            let result = `${initialIndent}interface ${iterationName} {\r\n`;
            for (let member of (iteration as InterfaceLiteralDescription).__members) {
                result += writeLineBrokenProperty(indentRepeat + 1, member);
            }
            result += `${initialIndent}}\r\n`;
            if (iteration.__description) {
                result = `${initialIndent}/** ${iteration.__description} */\r\n${result}`;
            }
            return result;
        }
        else if (iteration.__type === "delegate") {
            let signature = normalizeDelegateSignature((iteration as DelegateDescription)).__signature;
            // description for parameters
            let result = `${initialIndent}/** ${iteration.__description} */\r\n`;
            result += `${initialIndent}type ${iterationName}`
            if (signature.typeParameters) {
                result += `<${signature.typeParameters.join(', ')}>`
            }
            result += ` = (${writeParameters(signature)}) => void;\r\n`;
            return result;
        }
        else if (iteration.__type === "interface") {
            let result = `${initialIndent}/** ${iteration.__description} */\r\n`;
            result += `${initialIndent}interface ${iterationName}`;
            if ((iteration as InterfaceDescription).__typeParameters) {
                result += `<${(iteration as InterfaceDescription).__typeParameters.join(', ')}>`
            }
            if ((iteration as InterfaceDescription).__interfaces.length > 0) {
                result += ` extends ${(iteration as InterfaceDescription).__interfaces.map(interf => typeLinker(interf)).join(', ')}`;
            }
            let body = "";
            for (let itemName in iteration) {
                if ((itemName as string).startsWith("__") || itemName === "prototype") {
                    continue;
                }
                body += writeMemberLines(indentRepeat + 1, iteration[itemName] as TypeNameOrDescription, itemName);
            }
            if (body.length > 0) {
                result += ` {\r\n${body}${initialIndent}}\r\n`;
            }
            else {
                result += ` {}\r\n`
            }
            return result;
        }
    }


    function writeClass(indentRepeat: number, constructor: ExtendedClassDescription, className: string, unconstructable?: boolean) {
        let initialIndent = repeatIndent(indentBase, indentRepeat);
        let nextLevelIndent = initialIndent + indentBase;
        unconstructable = unconstructable || !constructor.__constructor;

        let classPrefix = unconstructable ? "abstract " : "";
        let result = "";
        if (constructor.__description) {
            result += `${initialIndent}/** ${constructor.__description} */\r\n`;
        }
        result += `${initialIndent}${classPrefix}class ${className}`;

        let typeForIVectorView: string;

        if (constructor.__extends && constructor.__extends !== "Object") {
            result += ` extends ${constructor.__extends}`
            if (constructor.__extends === "Array") {
                let vectorView = constructor.__interfaces && constructor.__interfaces.filter(name => name.startsWith("IVector"))[0];
                if (vectorView) {
                    typeForIVectorView = typeLinker(vectorView.match(/IVector(?:View)?<(.+)>/)[1].replace(/\^/g, ''));
                    result += `<${typeForIVectorView}>`;
                }
            }
        }
        result += ' {\r\n';

        for (let itemName in constructor) {
            if ((itemName as string).startsWith("__") || itemName === "prototype") {
                continue;
            }
            result += writeMemberLines(indentRepeat + 1, constructor[itemName] as TypeNameOrDescription, itemName, true);
        }

        if (constructor.__staticEventTarget) {
            result += `${nextLevelIndent}static addEventListener(type: string, listener: Windows.Foundation.EventHandler<any>): void;\r\n`;
            result += `${nextLevelIndent}static removeEventListener(type: string, listener: Windows.Foundation.EventHandler<any>): void;\r\n`;
        }

        if (!unconstructable) {
            let ctor = constructor.__constructor;
            for (let signature of (ctor as FunctionDescription).__signatures) {
                result += writeSingatureComment(indentRepeat + 1, signature);
                result += `${nextLevelIndent}constructor(${writeParameters(signature)});\r\n`;
            }
        }

        let prototype = constructor.prototype;
        for (let itemName in prototype) {
            if ((itemName as string).startsWith("__")) {
                continue;
            }
            result += writeMemberLines(indentRepeat + 1, prototype[itemName] as TypeNameOrDescription, itemName);
        }

        if (constructor.__eventTarget) {
            result += `${nextLevelIndent}addEventListener(type: string, listener: Windows.Foundation.EventHandler<any>): void;\r\n`;
            result += `${nextLevelIndent}removeEventListener(type: string, listener: Windows.Foundation.EventHandler<any>): void;\r\n`;
        }
        if (typeForIVectorView) { // hacky way to resolve IVectorView confliction http://stackoverflow.com/questions/34087631
            result += `${nextLevelIndent}indexOf(value: ${typeForIVectorView}, ...extra: any[]): { index: number; returnValue: boolean; } /* hack */\r\n`;
            result += `${nextLevelIndent}indexOf(searchElement: ${typeForIVectorView}, fromIndex?: number): number; /* hack */\r\n`;
        }

        result += initialIndent + '}';
        return result;
    }
    function writeMemberLines(indentRepeat: number, member: TypeNameOrDescription, memberName: string, asStatic?: boolean) {
        let indent = repeatIndent(indentBase, indentRepeat);
        let prefix = asStatic ? "static " : "";

        if (typeof member === "string") {
            if (member === "unknown") {
                return `${indent}${prefix}${memberName}: any; /* unmapped type */\r\n`;
            }
            else {
                throw new Error("Unexpected class member type");
            }
        }
        else {
            if (member.__type === "function") {
                let result = "";
                for (let signature of tryNormalizeAsyncCallReturnType(member as FunctionDescription).__signatures) {
                    signature = normalizeSignature(signature, memberName);
                    // TODO: description for parameters
                    result += writeSingatureComment(indentRepeat, signature);
                    result += `${indent}${prefix}${memberName}(${writeParameters(signature)}): `;
                    let returnType = writeReturnType(signature);
                    if (returnType !== "unknown") {
                        result += `${returnType};`;
                    }
                    else {
                        result += "any; /* unmapped return type */";
                    }
                    result += "\r\n";
                }
                return result;
            }
            else if (member.__type === "event") {
                let delegate = normalizeTypeName((member as EventDescription).__delegate);
                let result = `${indent}${prefix}${memberName}: ${delegate};\r\n`;
                result += `${indent}${prefix}addEventListener(type: "${memberName.slice(2)}", listener: ${delegate}): void;\r\n`;
                result += `${indent}${prefix}removeEventListener(type: "${memberName.slice(2)}", listener: ${delegate}): void;\r\n`;
                if (member.__description) {
                    result = `${indent}/** ${member.__description} */\r\n${result}`;
                }
                return result;
            }
            else {
                let result = `${indent}${prefix}${memberName}: ${normalizeTypeName(member.__type)};\r\n`
                if (member.__description) {
                    result = `${indent}/** ${member.__description} */\r\n${result}`;
                }
                return result;
            }
        }
    }
    function repeatIndent(indent: string, repeat: number) {
        let result = "";
        for (let i = 0; i < repeat; i++) {
            result += indent;
        }
        return result;
    }
    function writeParameters(signature: FunctionSignature) {
        let parameterArray: string[] = [];
        for (let parameter of signature.parameters) {
            let key = parameter.key;
            if (key === "arguments") {
                key = "args"; // tsc errors if the parameter name is "arguments" even when in ambient condition
            }
            else if (key === "function") {
                key = "func"; // keyword
            }
            parameterArray.push(`${key}: ${normalizeTypeName(extractJSOrCppType(parameter.type))}`);
        }
        return parameterArray.join(', ');
    }
    function writeReturnType(signature: FunctionSignature) {
        let signatureReturn = signature.return;
        if (!signatureReturn) {
            return "void";
        }

        if (typeof signatureReturn === "string") {
            throw new Error("Unexpected string return type"); // only in class constructor ("instance")
        }
        else {
            if (signatureReturn.type === "interfaceliteral") {
                let members = (signatureReturn as InterfaceLiteralTypeNotation).members;
                return `{ ${members.map((member) => writeInlineProperty(member)).join(" ")} }`;
            }
            else {
                return normalizeTypeName(extractJSOrCppType(signatureReturn.type));
            }
        }
    }
    function writeSingatureComment(indentRepeat: number, signature: FunctionSignature) {
        let indent = repeatIndent(indentBase, indentRepeat);
        let result = `${indent}/**`;
        if (signature.parameters.length === 0 && typeof signature.return !== "object") {
            result += ` ${signature.description} */\r\n`
            return result;
        }
        result += `\r\n${indent} * ${signature.description}\r\n`
        for (let parameter of signature.parameters) {
            result += `${indent} * @param ${parameter.key} ${parameter.description}\r\n`;
        }
        let ret = signature.return;
        if (ret && typeof ret !== "string" && ret.description /* can be empty when type is unknown or complex*/) {
            // TODO: write a correct JSDoc for complex return type
            // http://stackoverflow.com/a/19326949/2460034
            result += `${indent} * @return ${ret.description}\r\n`
        }
        result += `${indent} */\r\n`;
        return result;
    }
    function writeLineBrokenProperty(indentRepeat: number, property: DescribedKeyTypePair) {
        let indent = repeatIndent(indentBase, indentRepeat);
        let result = `${indent}${property.key}: ${normalizeTypeName(extractJSOrCppType(property.type))};\r\n`;
        if (property.description) {
            result = `${indent}/** ${property.description} */\r\n${result}`;
        }
        return result;
    }
    function writeInlineProperty(property: DescribedKeyTypePair) {
        let result = `${property.key}: ${normalizeTypeName(extractJSOrCppType(property.type))};`;
        if (property.description) {
            result = `/** ${property.description} */ ${result}`;
        }
        return result;
    }


    function normalizeTypeName(typeName: string) {
        let arrayIndication = false;
        if (!typeName) {
            debugger;
        }
        if (typeName.startsWith("array of ")) {
            arrayIndication = true;
            typeName = typeName.slice(9);
        }

        typeName = typeLinker(typeName);

        if (arrayIndication) {
            typeName += '[]';
        }
        if (typeName.includes(".I2C")) {
            typeName = typeName.replace(/\.I2C/g, ".I2c");
        }

        return typeName;
    }

    function normalizeSignature(signature: FunctionSignature, name: string) {
        let newSignature = {
            description: signature.description,
            parameters: []
        } as FunctionSignature;
        let outParameters: DescribedKeyTypePair[] = [];

        for (let i = 0; i < signature.parameters.length; i++) {
            let parameter = signature.parameters[i];

            let markedAsOut = false;
            if (parameter.key.endsWith(" (out parameter)")) {
                markedAsOut = true;
                parameter.key = parameter.key.slice(0, -16).trim();
            }
            
            if (markedAsOut) {
                outParameters.push(parameter);
            }
            else {
                newSignature.parameters.push(parameter);
            }
        }

        if (outParameters.length === 0) {
            newSignature.return = signature.return;
            return newSignature;
        }
        else if (outParameters.length === 1 && !signature.return) {
            let outAsReturn = outParameters[0];
            newSignature.return = {
                description: outAsReturn.description,
                type: outAsReturn.type
            } as TypeNotation;
            return newSignature;
        }
        else {
            if (signature.return) {
                outParameters.push({
                    description: (signature.return as TypeNotation).description,
                    key: "returnValue",
                    type: (signature.return as TypeNotation).type
                });
            }
            newSignature.return = {
                description: "",
                type: "interfaceliteral",
                members: outParameters
            } as InterfaceLiteralTypeNotation;
            return newSignature;
        }
    }
    
    function normalizeDelegateSignature(delegateDesc: DelegateDescription) {
        if (!delegateDesc.__fullname.endsWith("EventHandler")) {
            // Change below is only requried for event handlers
            return delegateDesc;
        }
        let signature = delegateDesc.__signature;
        if (!signature.parameters.length) {
            signature.parameters[0] = {
                key: "ev",
                type: "WinRTEvent<void>",
                description: ""
            } as DescribedKeyTypePair;
        }
        else {
            let sender = signature.parameters[0];
            let eventArg = signature.parameters[1];
            let prefix = eventArg ? `${extractJSOrCppType(eventArg.type)} & ` : "";
            signature.parameters = [];
            signature.parameters[0] = {
                key: "ev",
                type: `${prefix}WinRTEvent<${extractJSOrCppType(sender.type)}>`,
                description: ""
            } as DescribedKeyTypePair;
        }
        return delegateDesc;
    }
    function tryNormalizeAsyncCallReturnType(functionDesc: FunctionDescription) {
        if (!functionDesc.__fullname.endsWith("Async")) {
            // Only for fooAsync-formed methods
            return functionDesc;
        }
        for (let signature of functionDesc.__signatures) {
            let returnNotation = signature.return;
            if (typeof returnNotation === "string") {
                throw new Error("Unexpected string return type");
            }
            else {
                let returnType = extractJSOrCppType(returnNotation.type);
                if (returnType.endsWith("Operation")) {
                    returnNotation.type = `Windows.Foundation.IPromiseWithOperation<any /* unmapped */,${returnNotation.type}>`;
                }
                else if (returnType.startsWith("Windows.Foundation.IAsync")) {
                    // alias type IPromiseWithIAsyncOperation<TResult> = IPromiseWithOperation<TResult, IAsyncOperation<TResult>>, etc
                    returnNotation.type = returnType.replace(/^Windows.Foundation.(IAsync\w+)/, "Windows.Foundation.IPromiseWith$1");
                }
            }
        }
        return functionDesc;
    }
}

// Note that tag language names is different on code snippets
// tag on type: JavaScript/C++
// tag on snippets: JavaScript/ManagedCPlusPlus
// Should the names be normalized by parser?
function extractJSOrCppType(type: string | LanguageTaggedContent[]) {
    if (typeof type === "string") {
        return type;
    }
    else {
        let jsType = type.filter(tagged => tagged.language === "JavaScript")[0];
        if (jsType) {
            return jsType.content;
        }
        let cppType = type.filter(tagged => tagged.language === "C++")[0];
        if (cppType) {
            return cppType.content;
        }
        throw new Error("Expected JavaScript or C++ tag but not found");
    }
}


async function loadDocs(forceReparse?: boolean) {
    if (await fspromise.exists("built/typemap.json") && !forceReparse) {
        return JSON.parse(await fspromise.readFile("built/typemap.json"));
    }

    let result: any;
    try {
        result = await parse();
    }
    catch (err) {
        debugger;
        throw err;
    }
    if (!(await fspromise.exists("built"))) {
        await fspromise.makeDirectory("built");
    }
    await fspromise.writeFile("built/typemap.json", JSON.stringify(result, null, 2));
    return result;
}


function parseArgs() {
    let result: any = {};
    let proposedArgName: string;
    for (let arg of process.argv.slice(2)) {
        if (arg === "--force-reparse") {
            result[arg] = undefined;
            proposedArgName = undefined;
        }
        else if (arg === "-i" || arg === "-o" || arg === "-mapout") {
            proposedArgName = arg;
            result[arg] = undefined;
        }
        else {
            if (proposedArgName) {
                if (!arg.startsWith("-")) {
                    result[proposedArgName] = arg;
                }
                else {
                    throw new Error(`Unexpected argument after ${proposedArgName}: ${arg}`);
                }
            }
            else {
                throw new Error(`Unexpected argument: ${arg}`);
            }
            proposedArgName = undefined;
        }
    }
    return result;
}

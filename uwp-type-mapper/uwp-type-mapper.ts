"use strict";

import parse from "./uwp-type-parser"
import {
TypeNotation,
FunctionTypeNotation,
DescribedKeyTypePair,
FunctionSignature,
DelegateTypeNotation,
EventTypeNotation,
NamespaceDocumentNotation,
StructureTypeNotation
} from "./uwp-type-parser";
import {
ClassDescription,
TypeDescription,
TypeNameOrDescription
} from "../uwp-type-iterator/iterator";
import * as fspromise from "./fspromise"

main().catch((err) => console.error(err));

interface InterfaceLiteralTypeNotation {
    description: string;
    type: "interfaceliteral"
    members: DescribedKeyTypePair[];
}

interface ExtendedFunctionSignature extends FunctionSignature {
    return: "instance" | TypeNotation | InterfaceLiteralTypeNotation;
}
interface ExtendedClassDescription extends ClassDescription {
    __eventTarget?: boolean;
    __constructor: FunctionDescription;
}

interface FunctionDescription extends TypeDescription { __type: "function"; __signatures: ExtendedFunctionSignature[]; }
interface EventDescription extends TypeDescription { __type: "event"; __delegate: string; }
interface DelegateDescription extends TypeDescription { __type: "delegate"; __signature: FunctionSignature; }
interface InterfaceLiteralDescription extends TypeDescription { __type: "interfaceliteral"; __members: DescribedKeyTypePair[]; }

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
    let prepend = await fspromise.readFile("supplies/prepend.d.ts");
    let typelink = JSON.parse(await fspromise.readFile("supplies/typelink.json"));
    {
        let temp = {} as any;
        for (let name of Object.getOwnPropertyNames(typelink).sort()) {
            temp[name] = typelink[name];
        }
        await fspromise.writeFile("supplies/typelink.json", JSON.stringify(temp, undefined, 4));
    }

    console.log("Loading documentations...");
    let docs = await loadDocs("--force-reparse" in args)
    console.log("Loading iteration file...");
    let iterations = JSON.parse(await fspromise.readFile(args["-i"]));

    console.log("Mapping...");
    map(iterations, docs);

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
        let typeNameRegex = /[\w\.]+/g;
        let remainingGenericSyntax = /^<(.+)>$/;

        let result = typeName.replace(typeNameRegex, (match) => {
            if (match.toLowerCase() in docs) {
                return match;
            }
            let linkedType = typelink[match];
            if (linkedType != null) {
                return linkedType;
            }
            let interfaceMatch = match.match(/\.I([A-Z]\w+)/);
            if (!interfaceMatch) {
                return match;
            }
            let valueName = match.replace(/\.I([A-Z]\w+)/, ".$1");
            if (valueName.toLowerCase() in docs) {
                return valueName;
            }
            return match;
        });

        let remainingGenericMatch = result.match(remainingGenericSyntax);
        if (remainingGenericMatch) {
            result = remainingGenericMatch[1];
        }

        return result;
    }
}

function map(parentIteration: TypeDescription, docs: any) {
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
    let typeReferenceSet = new Set<string>();
    typeReferenceSet.add("Windows.Foundation.EventHandler"); // documents reference this incorrectly
    mapItem(parentIteration);

    function mapItem(iteration: TypeDescription) {
        for (let itemName in iteration) {
            if ((itemName as string).startsWith("__")) {
                continue;
            }

            let item = iteration[itemName] as TypeNameOrDescription;
            if (typeof item === "string") {
                let fullName = `${iteration.__fullname}.${itemName}`.toLowerCase();

                let doc = docs[fullName] as TypeNotation;
                if (!doc) {
                    continue;
                }

                switch (doc.type) {
                    case "class":
                        break;
                    case "enumeration":
                        break;
                    case "namespace":
                        break;
                    case "delegate":
                        break;
                    case "function":
                        /*
                        TODO: interfaces from parser and iterator are too different, should be integrated
                        */
                        iteration[itemName] = {
                            __fullname: fullName,
                            __type: "function",
                            __description: doc.description,
                            __signatures: rememberReferenceInSignatures((doc as FunctionTypeNotation).signatures)
                        } as FunctionDescription;
                        break;
                    case "event":
                        /*
                        TODO: methods and onevents must be distingushable (by __type?)
                        Do FunctionDescription have to allow "function"|"?" <- What name? callback?
                         */
                        typeReferenceSet.add(removeGenericsSyntax((doc as EventTypeNotation).delegate));
                        iteration[itemName] = {
                            __fullname: fullName,
                            __type: "event",
                            __description: doc.description,
                            __delegate: (doc as EventTypeNotation).delegate
                        } as EventDescription;
                        break;
                    default: {
                        iteration[itemName] = {
                            __fullname: fullName,
                            __type: doc.type,
                            __description: doc.description
                        } as TypeDescription;
                        break;
                    }
                }
            }
            else {
                let fullName = item.__fullname.toLowerCase();
                let doc = docs[fullName] as TypeNotation;
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
                        }
                    }
                    mapItem(item);
                }
                else if (item.__type === "class") {
                    if (doc && doc.type === "attribute") {
                        item.__type = doc.type;
                    }
                    mapItem(item);

                    let ctorFullName = `${fullName}.constructor`;
                    let ctorDoc = docs[ctorFullName] as FunctionTypeNotation;
                    if (ctorDoc) {
                        item["__constructor"] = {
                            __fullname: ctorFullName,
                            __description: ctorDoc.description,
                            __type: "function",
                            __signatures: rememberReferenceInSignatures(ctorDoc.signatures)
                        } as FunctionDescription;
                    }

                    if (hasEventCallback((item as ExtendedClassDescription).prototype)) {
                        (item as ExtendedClassDescription).__eventTarget = true;
                        delete (item as ExtendedClassDescription).prototype["addEventListener"];
                        delete (item as ExtendedClassDescription).prototype["removeEventListener"];
                    }
                }
            }
        }
    }

    for (let typeReference of typeReferenceSet) {
        let doc = docs[typeReference.toLowerCase()] as TypeNotation;
        if (!doc) {
            continue;
        }
        let parentNamespace = nonValueTypeParentNamespaceMap.get(typeReference);
        if (!parentNamespace) {
            continue;
        }
        if (doc.type === "structure") {
            let split = typeReference.split('.');
            let shortName = split[split.length - 1];
            if (!shortName) {
                throw new Error(`Unexpected structure name: ${typeReference}`);
            }
            parentNamespace[shortName] = {
                __fullname: typeReference,
                __description: doc.description,
                __type: "interfaceliteral",
                __members: (doc as StructureTypeNotation).members
            } as InterfaceLiteralDescription;
        }
        else if (doc.type === "delegate") {
            let split = typeReference.split('.');
            let shortName = split[split.length - 1];
            if (!shortName) {
                throw new Error(`Unexpected structure name: ${typeReference}`);
            }
            parentNamespace[shortName] = {
                __fullname: typeReference,
                __description: doc.description,
                __type: "delegate",
                __signature: (doc as DelegateTypeNotation).signature
            } as DelegateDescription;
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

    function rememberReferenceInSignatures(signatures: FunctionSignature[]) {
        for (let signature of signatures) {
            for (let parameter of signature.parameters) {
                typeReferenceSet.add(removeGenericsSyntax(parameter.type));
            }
            if (signature.return && typeof signature.return !== "string") {
                typeReferenceSet.add(removeGenericsSyntax((signature.return as TypeNotation).type));
            }
        }
        return signatures;
    }

    function removeGenericsSyntax(text: string) {
        let genericsMatch = text.match(genericsRegex);
        if (genericsMatch) {
            text = text.slice(0, genericsMatch.index);
        }
        return text;
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
            let signature = (iteration as DelegateDescription).__signature;
            // description for parameters
            let result = `${initialIndent}/** ${iteration.__description} */\r\n`;
            result += `${initialIndent}type ${iterationName}`
            if (signature.typeParameters) {
                result += `<${signature.typeParameters.join(', ')}>`
            }
            result += ` = (${writeParameters(signature)}) => void;\r\n`;
            return result;
        }
    }


    function writeClass(indentRepeat: number, constructor: ExtendedClassDescription, className: string, unconstructable?: boolean) {
        let initialIndent = repeatIndent(indentBase, indentRepeat);
        let nextLevelIndent = initialIndent + indentBase;
        let classPrefix = unconstructable ? "abstract " : "";
        let result = "";
        if (constructor.__description) {
            result += `${initialIndent}/** ${constructor.__description} */\r\n`;
        }
        result += `${initialIndent}${classPrefix}class ${className}`;

        if (constructor.__extends && constructor.__extends !== "Object") {
            result += ` extends ${constructor.__extends}`
        }
        result += ' {\r\n';

        for (let itemName in constructor) {
            if ((itemName as string).startsWith("__") || itemName === "prototype") {
                continue;
            }
            result += writeClassMemberLines(indentRepeat + 1, constructor[itemName] as TypeNameOrDescription, itemName, true);
        }

        if (constructor.__constructor && !unconstructable) {
            let ctor = constructor.__constructor;
            for (let signature of (ctor as FunctionDescription).__signatures) {
                // TODO: description for parameters
                result += `${nextLevelIndent}/** ${signature.description} */\r\n`;
                result += `${nextLevelIndent}constructor(${writeParameters(signature)});\r\n`;
            }
        }

        let prototype = constructor.prototype;
        for (let itemName in prototype) {
            if ((itemName as string).startsWith("__")) {
                continue;
            }
            result += writeClassMemberLines(indentRepeat + 1, prototype[itemName] as TypeNameOrDescription, itemName);
        }

        if (constructor.__eventTarget) {
            result += `${nextLevelIndent}addEventListener(type: string, listener: Windows.Foundation.EventHandler<any>): void;\r\n`;
            result += `${nextLevelIndent}removeEventListener(type: string, listener: Windows.Foundation.EventHandler<any>): void;\r\n`;
        }

        result += initialIndent + '}';
        return result;
    }
    function writeClassMemberLines(indentRepeat: number, member: TypeNameOrDescription, memberName: string, asStatic?: boolean) {
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
                for (let signature of (member as FunctionDescription).__signatures) {
                    signature = normalizeSignature(signature, memberName);
                    // TODO: description for parameters
                    result += `${indent}/** ${signature.description} */\r\n`;
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
            parameterArray.push(`${key}: ${normalizeTypeName(parameter.type)}`);
        }
        return parameterArray.join(', ');
    }
    function writeReturnType(signature: FunctionSignature) {
        let signatureReturn = signature.return;
        if (!signatureReturn) {
            return "void";
        }

        if (typeof signatureReturn === "string") {
            throw new Error("Unexpected string return type"); // only in class constructor
        }
        else {
            if (signatureReturn.type === "interfaceliteral") {
                let members = (signatureReturn as InterfaceLiteralTypeNotation).members;
                return `{ ${members.map((member) => writeInlineProperty(member)).join(" ")} }`;
            }
            else {
                return normalizeTypeName(signatureReturn.type);
            }
        }
    }
    function writeLineBrokenProperty(indentRepeat: number, property: DescribedKeyTypePair) {
        let indent = repeatIndent(indentBase, indentRepeat);
        let result = `${indent}${property.key}: ${normalizeTypeName(property.type)};\r\n`;
        if (property.description) {
            result = `${indent}/** ${property.description} */\r\n${result}`;
        }
        return result;
    }
    function writeInlineProperty(property: DescribedKeyTypePair) {
        let result = `${property.key}: ${normalizeTypeName(property.type)};`;
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
        let codeSnippetArgs = extractCallArguments(signature.codeSnippet, name);
        
        for (let i = 0; i < signature.parameters.length; i++) {
            let parameter = signature.parameters[i];
            let arg = codeSnippetArgs[i];

            let markedAsOut = false;
            if (parameter.key.endsWith(" (out parameter)")) {
                markedAsOut = true;
                parameter.key = parameter.key.slice(0, -16).trim();
            }

            if (parameter.key !== arg) {
                if (markedAsOut) {
                    outParameters.push(parameter);
                }
                else {
                    throw new Error("Unexpected parameter mismatch");
                }
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
    function extractCallArguments(codeSnippet: string, functionName: string) {
        let callSyntaxRegex = new RegExp(`${functionName}\\(([^\\)]*)\\)`);
        let callSyntax = codeSnippet.match(callSyntaxRegex);
        if (callSyntax) {
            return callSyntax[1].split(', ');
        }
        else {
            throw new Error("Cannot find function call inside code snippet");
        }
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

"use strict";

import parse from "./uwp-type-parser"
import {
TypeNotation,
FunctionTypeNotation,
DescriptedKeyTypePair,
FunctionSignature,
DelegateTypeNotation,
EventTypeNotation
} from "./uwp-type-parser";
import {
ClassDescription,
TypeDescription,
TypeNameOrDescription
} from "../uwp-type-iterator/iterator";
import * as fspromise from "./fspromise"

main().catch((err) => console.error(err));

interface InterfaceLiteralTypeNotation {
    description: ""; // describe in key-type pair array
    type: "interfaceliteral"
    members: DescriptedKeyTypePair[];
}

interface ExtendedFunctionSignature extends FunctionSignature {
    return: "instance" | TypeNotation | InterfaceLiteralTypeNotation;
}

interface FunctionDescription extends TypeDescription { __type: "function" | "callback"; __signatures: ExtendedFunctionSignature[]; }



async function main() {
    let args = parseArgs();
    if (!args["-i"]) {
        throw new Error("Input iteration file path is not specified.");
    }
    if (!args["-o"]) {
        throw new Error("Output file path is not specified.");
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
    await fspromise.writeFile(args["-o"], writeAsDTS(iterations, "Windows"));

    console.log("Finished.");
    process.exit();
}

function map(iteration: TypeDescription, docs: any) {
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
                    TypeDescription does not have members for function signatures
                    */
                    iteration[itemName] = {
                        __fullname: fullName,
                        __type: "function",
                        __description: doc.description,
                        __signatures: (doc as FunctionTypeNotation).signatures
                    } as FunctionDescription;
                    break;
                case "event":
                    /*
                    TODO: methods and onevents must be distingushable (by __type?)
                    Do FunctionDescription have to allow "function"|"?" <- What name? callback?
                     */
                    iteration[itemName] = {
                        __fullname: fullName,
                        __type: "callback",
                        __description: doc.description,
                        __signatures: (doc as FunctionTypeNotation).signatures
                    } as FunctionDescription;
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
                if (doc && doc.type === "enumeration") {
                    item.__type = doc.type;
                }
                map(item, docs);
            }
            else if (item.__type === "class") {
                map(item, docs);

                if (hasEventCallback((item as ClassDescription).prototype)) {
                    (item as ClassDescription).__eventTarget = true;
                }
            }
        }
    }

    function hasEventCallback(iteration: TypeDescription) {
        for (let itemName in iteration) {
            if ((itemName as string).startsWith("__")) {
                continue;
            }
            let item = iteration[itemName] as TypeNameOrDescription;
            if ((item as TypeDescription).__type === "callback") {
                return true;
            }
        }
        return false;
    }
}

function writeAsDTS(baseIteration: TypeDescription, baseIterationName: string) {
    let stack: TypeDescription[] = [];
    let indentBase = "    ";
    return "declare " + write(0, baseIteration, baseIterationName);

    function write(indentRepeat: number, iteration: TypeNameOrDescription, iterationName: string) {
        let initialIndent = repeatIndent(indentBase, indentRepeat);
        let nextLevelIndent = initialIndent + indentBase;
        let result = "";

        if (typeof iteration === "string") {
            if (iteration === "unknown") {
                result += initialIndent + `var ${iterationName}: any; /* unmapped type */\r\n`;
            }
            else if (iteration === "undefined") {
                result += initialIndent + `var ${iterationName}: void;\r\n`;
            }
            //else {
            //    throw new Error("Unexpected iteration type");
            //}
        }
        else if (iteration.__type === "structure") {
            result += initialIndent + `namespace ${iterationName} {\r\n`
            for (let itemName in iteration) {
                if ((itemName as string).startsWith("__")) {
                    continue;
                }
                result += write(indentRepeat + 1, iteration[itemName], itemName);
            }
            result += initialIndent + '}\r\n';
        }
        else if (iteration.__type === "enumeration") {
            result += initialIndent + `enum ${iterationName} {\r\n`;
            for (let itemName in iteration) {
                if ((itemName as string).startsWith("__")) {
                    continue;
                }
                let item = iteration[itemName] as TypeDescription;
                if (item.__description) {
                    result += nextLevelIndent + `/** ${item.__description} */\r\n`;
                }
                result += nextLevelIndent + `${itemName},\r\n`;
            }
            result += initialIndent + '}\r\n';
        }
        else if (iteration.__type === "class") {
            result += `${writeClass(indentRepeat, iteration as ClassDescription, iterationName)}\r\n`;
        }
        return result;
    }


    function writeClass(indentRepeat: number, constructor: ClassDescription, className: string) {
        let initialIndent = repeatIndent(indentBase, indentRepeat);
        let nextLevelIndent = initialIndent + indentBase;
        let result = "";
        if (constructor.__description) {
            result += initialIndent + `/** ${constructor.__description} */\r\n`;
        }
        result += initialIndent + `class ${className}`;

        if (constructor.__extends && constructor.__extends !== "Object") {
            result += ` extends ${constructor.__extends}`
        }
        if (constructor.__eventTarget) {
            result += " implements ImmutableEventTarget"; // Only have add/removeEventListener without dispatchEvent
        }
        result += ' {\r\n';

        for (let itemName in constructor) {
            if ((itemName as string).startsWith("__") || itemName === "prototype") {
                continue;
            }
            result += writeClassMemberLines(indentRepeat + 1, constructor[itemName] as TypeNameOrDescription, itemName, true);
        }
        let prototype = constructor.prototype;
        for (let itemName in prototype) {
            if ((itemName as string).startsWith("__")) {
                continue;
            }
            result += writeClassMemberLines(indentRepeat + 1, prototype[itemName] as TypeNameOrDescription, itemName);
        }

        result += initialIndent + '}';
        return result;
    }
    function writeClassMemberLines(indentRepeat: number, member: TypeNameOrDescription, memberName: string, asStatic?: boolean) {
        let indent = repeatIndent(indentBase, indentRepeat);
        let result = "";
        let prefix = asStatic ? "static " : "";

        if (typeof member === "string") {
            if (member === "unknown") {
                result += indent + `${prefix}${memberName}: any; /* unmapped type */\r\n`;
            }
            else {
                throw new Error("Unexpected class member type");
            }
        }
        else {
            if (member.__type === "function") {
                for (let signature of (member as FunctionDescription).__signatures) {
                    signature = normalizeSignature(signature, memberName);
                    // TODO: description for parameters
                    result += indent + `/** ${signature.description} */\r\n`;
                    result += indent + `${prefix}${memberName}(${writeParameters(signature)}): `;
                    let returnType = writeReturnType(signature);
                    if (returnType !== "unknown") {
                        result += `${returnType};`;
                    }
                    else {
                        result += "any; /* unmapped return type */";
                    }
                    result += "\r\n";
                }
            }
        }
        return result;
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
                let interfaceLiteralContent = members.map((member) => {
                    let memberNotation = `${member.key}: ${normalizeTypeName(member.type)}`;
                    if (member.description) {
                        memberNotation = `/** ${member.description} */ ${memberNotation}`;
                    }
                    return memberNotation;
                }).join("; ");
                return `{ ${interfaceLiteralContent} }`;
            }
            else {
                return normalizeTypeName(signatureReturn.type);
            }
        }
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

        if (typeName === "String" || typeName === "Boolean" || typeName === "Number") {
            typeName = typeName.toLowerCase();
        }
        else if (typeName === "Object") {
            typeName = "any";
        }
        else {
            let backtickIndex = typeName.indexOf("`");
            if (backtickIndex !== -1) {
                typeName = typeName.slice(0, backtickIndex);
            }
        }

        if (arrayIndication) {
            typeName += '[]';
        }

        return typeName;
    }

    function normalizeSignature(signature: FunctionSignature, name: string) {
        let newSignature = {
            description: signature.description,
            parameters: []
        } as FunctionSignature;
        let outParameters: DescriptedKeyTypePair[] = [];
        let codeSnippetArgs = extractCallArguments(signature.codeSnippet, name);
        
        // TODO: use args
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
                    description: signature.description,
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

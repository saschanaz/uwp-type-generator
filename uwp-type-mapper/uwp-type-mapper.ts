"use strict";

import parse from "./uwp-type-parser"
import {
TypeNotation,
FunctionTypeNotation,
FunctionParameter,
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

async function main() {
    let args = parseArgs();
    if (!args["-i"]) {
        throw new Error("Input iteration file path is not specified.");
    }

    let docs = await loadDocs("--force-reparse" in args)
    let iterations = JSON.parse(await fspromise.readFile(args["-i"]));

    map(iterations, docs);

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
            if (item !== "unknown") {
                continue;
            }

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
                    break;
                case "event":
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
        else if (item.__type === "structure") {
            map(item, docs);
        }
        else if (item.__type === "class") {
            map(item, docs);
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
        else if (arg === "-i") {
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

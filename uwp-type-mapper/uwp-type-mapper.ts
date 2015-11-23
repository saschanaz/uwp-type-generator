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
} from "../uwp-type-iterator/sources/generator";
import * as fspromise from "./fspromise"

main();

async function main() {
    let args = parseArgs();
    if (!args["-i"]) {
        throw new Error("Input iteration file path is not specified.");
    }

    let docs = await loadDocs(args["--force-reparse"])
    let iteration = await fspromise.readFile(args["-i"]);

    
}

async function map(iteration: any, docs: any) {
    for (let itemName in iteration) {
        let item = iteration[itemName] as TypeNameOrDescription;
        if (typeof item === "string") {

        }
        else {
            let doc = docs[item.__fullname.toLowerCase()];
            doc;
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

    function objectify(map: Map<string, TypeNotation>) {
        let ob: any = {};
        let sortedEntries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        for (let entry of sortedEntries) {
            ob[entry[0]] = entry[1];
        }
        return ob;
    }
}


function parseArgs() {
    let result: any = {};
    let proposedArgName: string;
    for (let arg of process.argv) {
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

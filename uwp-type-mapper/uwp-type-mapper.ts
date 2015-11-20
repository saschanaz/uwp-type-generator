"use strict";

import * as fs from "fs"
import * as jsdom from "jsdom"

interface Reference {
    desciption: string;
    signatures: FunctionSignature[];
    type: string;
}

interface FunctionSignature {
    parameters: KeyTypePair[];// 
    return: string;
}
interface KeyTypePair {
    key: string;
    type: string;
}

interface TypeDescription { __type: "class" | "structure"; __fullname: string; };
type TypeNameOrDescription = string | TypeDescription;

interface ClassDescription { __type: "class"; __fullname: string; __extends: TypeDescription; prototype: TypeDescription; }

generateMapFile();

async function generateMapFile() {
    try {
        console.log(await parse());
    }
    catch (e) {
        debugger;
    }

    async function parse() {
        let referenceMap: { [key: string]: Reference } = {};

        let referencepath = "referencedocs";
        let mshelppath = "ms-help://";
        let bracketRegex = /\[[^\[]*\]/;
        let files = await fsReadFiles(referencepath);
        let skippedById: string[] = [];

        for (let filepath of files) {
            let text = await fsReadFile(`${referencepath}/${filepath}`);
            let doc = jsdom.jsdom(text) as Document;
            let metaHelpId = doc.head.querySelector("meta[name=Microsoft\\.Help\\.Id]") as HTMLMetaElement;
            if (!metaHelpId)
                continue;
            let helpId = metaHelpId.content.toLowerCase();
            let startIndex = helpId.indexOf(":windows");
            if (startIndex !== -1) {
                helpId = helpId.slice(startIndex + 1);
            }
            else {
                let metaF1 = doc.head.querySelector("meta[name$=F1]") as HTMLMetaElement;
                if (metaF1) {
                    skippedById.push(metaF1.content);
                }
                else {
                    skippedById.push(doc.title);
                }
                continue;
            }
            if (helpId.startsWith("windows.ui.xaml")) {
                continue; // Do not parse XAML API
            }
            let mainSection = doc.body.querySelector("div#mainSection");
            let mainContent = mainSection.textContent
            let desciption = mainContent.slice(0, mainContent.search(/\sSyntax\s/)).trim().replace(/\s{1,}/g, " ");
            let title = doc.body.querySelector("div.title").textContent.trim();
            let type: string;
            if (title.endsWith(" class")) {
                type = "class";
            }
            else if (title.endsWith(" property")) {
                let before = Array.from(mainSection.querySelectorAll("h2")).filter((h2) => h2.textContent.trim().startsWith("Property value"))[0];
                if (before) {
                    let typeNotationParagraph = before.nextElementSibling;
                    let typeInfo: string | Map<string, string>;
                    try {
                        typeInfo = parsePropertyTypeNotation(typeNotationParagraph as HTMLParagraphElement);
                    }
                    catch (e) {
                        continue;
                    }
                    if (typeof typeInfo === "string") {
                        type = typeInfo;
                    }
                    else if (typeInfo.has("JavaScript")) {
                        type = typeInfo.get("JavaScript");
                    }
                    else {
                        continue; // no type for JS
                    }
                }
                else {
                    debugger;
                }
            }
            else if (title.endsWith(" constructor")) {
                continue; // TODO
            }
            else if (title.endsWith(" constructors")) {
                continue; // TODO
            }
            else if (title.endsWith(" method")) {
                continue; // TODO
            }
            else if (title.endsWith(" methods")) {
                continue; // TODO: how should multiple method signatures be processed?
            }
            else if (title.endsWith(" enumeration")) {
                continue; // TODO
            }
            else if (title.endsWith(" event")) {
                continue; // TODO
                // Note: Remember both addEventListener and `onevent`
                // How can their existence be checked?
            }
            else if (title.endsWith(" namespace")) {
                continue; // TODO
                // Just parse the description
            }
            else if (title.endsWith(" structure") || title.endsWith(" interface")) {
                continue; // Is there any JS-targeted document?
            }
            else if (title.endsWith(" delegate") || title.endsWith(" delegates")) {
                continue; // Do not parse non-JS things
            }
            else {
                debugger;
                continue;
            }


            referenceMap[helpId] = {
                desciption,
                type
            } as Reference;
        }

        return referenceMap;


        function parsePropertyTypeNotation(notationElement: HTMLParagraphElement): string | Map<string, string> {
            

            /*
            Expect "Type:"
            If sliced text still have non-whitespace text:
                If the text includes a bracket formed language indicator:
                    Split it by indicator index
                    Assume the result as type name + language indicator
                Else
                    Assume the text as the only type name described
                    Return the text
            While there is no next element:
                If the next element is anchor:
                    Parse the reference as type name
                If the next element is <strong>:
                    Assume it as type name
                If the next element is text:
                    Try parsing it as language indicator
                Else:
                    Break, assuming there is no more type description
            */
            let typeMap = new Map<string, string>();

            let node = notationElement.firstChild;
            if (isText(node) && node.textContent.indexOf("Type:") === 0) {
                let sliced = node.textContent.slice(5).trim();
                if (sliced.length > 0) {
                    let brackets = bracketRegex.exec(sliced);
                    if (brackets) {
                        // language name, type name
                        typeMap.set(sliced.substr(brackets.index + 1, brackets[0].length - 2), sliced.slice(0, brackets.index));
                    }
                    else {
                        return sliced;
                    }
                }
            }
            else {
                debugger;
                throw new Error("Incorrect type description");
            }

            let proposedTypeName: string;

            node = node.nextSibling;
            let trimmedTextContent = node.textContent.trim();
            while (node) {
                if (isElement(node)) {
                    if (isAnchorElement(node)) {
                        // TODO: parse
                        proposedTypeName = node.href.slice(mshelppath.length);
                    }
                    else if (node.tagName === "STRONG" || node.tagName === "SPAN") {
                        proposedTypeName = trimmedTextContent
                    }
                    else {
                        debugger;
                        throw new Error("Unexpected element");
                    }
                }
                else if (isText(node) && trimmedTextContent.length > 0) {
                    let brackets = bracketRegex.exec(trimmedTextContent);
                    if (brackets) {
                        typeMap.set(trimmedTextContent.substr(brackets.index + 1, brackets[0].length - 2), proposedTypeName);
                    }
                    else {
                        debugger;
                        throw new Error("Expected a bracket but not found");
                    }
                }
                node = node.nextSibling;
                trimmedTextContent = node.textContent.trim();
            }
            if (typeMap.size === 0) {
                return proposedTypeName;
            }
            else {
                return typeMap;
            }
        }
    }
}

function isText(node: Node): node is Text {
    return node.nodeType === 3;
}
function isElement(node: Node): node is Element {
    return node.nodeType === 1;
}
function isAnchorElement(element: Element): element is HTMLAnchorElement {
    return element.tagName === "A";
}

function fsReadFiles(path: string) {
    return new Promise<string[]>((resolve, reject) => {
        fs.readdir(path, (err, files) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(files);
            }
        })
    });
}

function fsReadFile(path: string) {
    return new Promise<string>((resolve, reject) => {
        fs.readFile(path, "utf8", (err, data) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(data);
            }
        });
    });
}
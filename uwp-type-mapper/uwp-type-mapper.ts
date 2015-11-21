"use strict";

import * as fs from "fs"
import * as jsdom from "jsdom"

interface TypeNotation {
    description: string;
    type: string;
}

interface FunctionTypeNotation {
    description: ""; // describe in signature object
    type: "function";
    signatures: FunctionSignature[];
}
interface FunctionSignature {
    description: string;
    parameters: FunctionParameter[]; 
    return: "instance" | TypeNotation;
}
interface FunctionParameter {
    description: string;
    type: string;
    key: string;
}

generateMapFile();

async function generateMapFile() {
    try {
        if (!(await fsExists("built"))) {
            await fsMakeDirectory("built");
        }
        await fsWriteFile("built/typemap.json", JSON.stringify(objectify(await parse()), null, 2));
        process.exit();
    }
    catch (e) {
        debugger;
    }

    // TODO: receive path array (files from metro/, store/, etc)
    async function parse() {
        let referenceMap = new Map<string, TypeNotation>();

        let referencepath = "referencedocs";
        let mshelppath = "ms-xhelp:///?Id=T%3a";
        let bracketRegex = /\[[^\[]*\]/;
        let whitespaceRepeatRegex = /\s{1,}/g;
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
            // TODO: use target language meta tag? it can only be used with VS document
            let mainSection = doc.body.querySelector("div#mainSection");
            let mainContent = mainSection.textContent
            let description = inline(mainContent.slice(0, mainContent.search(/\sSyntax\s/)))
            let title = doc.body.querySelector("div.title").textContent.trim();
            if (title.endsWith(" class")) {
                // https://msdn.microsoft.com/en-us/library/windows/apps/windows.applicationmodel.background.smartcardtrigger.aspx

                referenceMap.set(helpId, {
                    description,
                    type: "class"
                } as TypeNotation);
            }
            else if (title.endsWith(" property")) {
                // example URL: https://msdn.microsoft.com/en-us/library/windows/apps/windows.applicationmodel.background.smartcardtrigger.triggertype.aspx
                
                let before = Array.from(mainSection.querySelectorAll("h2")).filter((h2) => h2.textContent.trim().startsWith("Property value"))[0];
                let typeNotationParagraph = before.nextElementSibling;
                let type = exportJavaScriptTypeNotation(parseTypeNotation(typeNotationParagraph as HTMLParagraphElement));
                if (!type) {
                    // JS incompatble
                    continue;
                }

                referenceMap.set(helpId, {
                    description,
                    type
                } as TypeNotation);
            }
            else if (title.endsWith(" constructor")) {
                // example URL
                // no parameter:
                // https://msdn.microsoft.com/en-us/library/windows/apps/dn858104.aspx
                // one parameter:
                // https://msdn.microsoft.com/en-us/library/windows/apps/windows.applicationmodel.background.smartcardtrigger.smartcardtrigger.aspx
                // multiple parameters:
                // https://msdn.microsoft.com/en-us/library/windows/apps/dn631282.aspx

                
                let ctorIndex = helpId.indexOf(".#ctor");
                if (ctorIndex !== -1) {
                    helpId = `${helpId.slice(0, ctorIndex)}.constructor`;
                }
                else {
                    debugger;
                    throw new Error("Expected .ctor but not found");
                }

                let signature = {
                    description,
                    parameters: undefined,
                    return: "instance"
                } as FunctionSignature;

                let before = Array.from(mainSection.querySelectorAll("h2")).filter((h2) => h2.textContent.trim().startsWith("Parameters"))[0];
                let parameterListElement = before.nextElementSibling as HTMLDListElement;
                signature.parameters = parseParameterList(parameterListElement);
                if (!signature.parameters) {
                    // JS incompatible
                    continue;
                }
                
                let notation = referenceMap.get(helpId) as FunctionTypeNotation || {
                    description: "", // 
                    type: "function",
                    signatures: []
                } as FunctionTypeNotation;
                notation.signatures.push(signature);

                referenceMap.set(helpId, notation);
                // Note: replace .#ctor(params) to .constructor
            }
            else if (title.endsWith(" method")) {
                let signature = {
                    description,
                    parameters: undefined,
                    return: undefined
                } as FunctionSignature;

                // TODO: remove call syntax from helpId so that signature can correctly be appended

                let before = Array.from(mainSection.querySelectorAll("h2")).filter((h2) => h2.textContent.trim().startsWith("Parameters"))[0];
                let parameterListElement = before.nextElementSibling as HTMLDListElement;
                signature.parameters = parseParameterList(parameterListElement);
                if (!signature.parameters) {
                    // JS incompatible
                    continue;
                }

                before = Array.from(mainSection.querySelectorAll("h2")).filter((h2) => h2.textContent.trim().startsWith("Return value"))[0];
                if (before) {
                    let typeNotationElement = before.nextElementSibling as HTMLParagraphElement;
                    let typeDescriptionElement = typeNotationElement.nextElementSibling;

                    let type = exportJavaScriptTypeNotation(parseTypeNotation(typeNotationElement));
                    if (!type) {
                        // JS incompatible
                        continue;
                    }

                    signature.return = {
                        description: inline(typeDescriptionElement.textContent),
                        type: parseTypeNotation(typeNotationElement)
                    } as TypeNotation;
                }

                let notation = referenceMap.get(helpId) as FunctionTypeNotation || {
                    description: "", // 
                    type: "function",
                    signatures: []
                } as FunctionTypeNotation;
                notation.signatures.push(signature);

                referenceMap.set(helpId, notation);
                // Proposal: insert FunctionTypeNotation, and later check same key exists and append more signatures
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
            else if (title.endsWith(" delegate") || title.endsWith(" delegates")) {
                // example URL: https://msdn.microsoft.com/en-us/library/windows/apps/br206577.aspx
                continue; // TODO: eventargs
            }
            else if (title.endsWith(" structure") || title.endsWith(" interface")) {
                continue; // Is there any JS-targeted document?
            }
            else if (title.endsWith(" constructors") || title.endsWith(" methods")) {
                continue; // Do not parse meta pages
            }
            else {
                debugger;
                continue;
            }
        }

        return referenceMap;


        function parseParameterList(listElement: HTMLDListElement): FunctionParameter[] {
            let parameters: FunctionParameter[] = [];
            let childItems = Array.from(listElement.children) as HTMLElement[];

            let parameterName: string;
            for (let child of childItems) {
                if (child.tagName === "DT") {
                    parameterName = child.textContent.trim();
                }
                else if (child.tagName === "DD") {
                    let parameterType = exportJavaScriptTypeNotation(parseTypeNotation(child.children[0] as HTMLParagraphElement));
                    if (!parameterType) {
                        // No JS type
                        return;
                    }

                    let parameterDescription: string;
                    if (child.children[1]) {
                        parameterDescription = inline(child.children[1].textContent);;
                    }

                    parameters.push({
                        description: parameterDescription,
                        type: parameterType,
                        key: parameterName
                    });
                }
                else {
                    debugger;
                    throw new Error("Unexpected element");
                }
            }
            return parameters;
        }

        function parseTypeNotation(notationElement: HTMLParagraphElement): string | Map<string, string> {
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


            Define Parsing as language indicator: 
                Slice(1, -1)
                If indexof '/' exists:
                    Split the string by '/'
                    Return result array
                Else
                    Return [text]
            */
            let typeMap = new Map<string, string>();

            let node = notationElement.firstChild;
            if (isText(node) && node.textContent.indexOf("Type:") === 0) {
                let sliced = node.textContent.slice(5).trim();
                if (sliced.length > 0) {
                    let brackets = bracketRegex.exec(sliced);
                    if (brackets) {
                        let parsedLanguages = parseLanguageIndicator(sliced.substr(brackets.index, brackets[0].length))
                        // language name, type name
                        for (let language of parsedLanguages) {
                            typeMap.set(language, sliced.slice(0, brackets.index));
                        }
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
            let trimmedTextContent: string;
            while (node) {
                trimmedTextContent = node.textContent.trim();
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
                        let parsedLanguages = parseLanguageIndicator(trimmedTextContent.substr(brackets.index, brackets[0].length))
                        for (let language of parsedLanguages) {
                            typeMap.set(language, proposedTypeName);
                        }
                    }
                    else {
                        debugger;
                        throw new Error("Expected a bracket but not found");
                    }
                }
                node = node.nextSibling;
            }
            if (typeMap.size === 0) {
                return proposedTypeName;
            }
            else {
                return typeMap;
            }
        }

        function parseLanguageIndicator(text: string) {
            /* Expect potential slash-separated input */
            text = text.slice(1, -1);
            if (text.indexOf('/') !== -1) {
                return text.split('/');
            }
            else {
                return [text];
            }
        }

        function exportJavaScriptTypeNotation(notation: string | Map<string, string>) {
            if (typeof notation === "string") {
                return notation;
            }
            else {
                return notation.get("JavaScript");
            }
        }

        function inline(text: string) {
            return text.trim().replace(whitespaceRepeatRegex, " ");
        }
    }

    function objectify(map: Map<string, TypeNotation>) {
        let ob: any = {};
        for (let entry of map.entries()) {
            ob[entry[0]] = entry[1];
        }
        return ob;
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

function fsWriteFile(path: string, content: string) {
    return new Promise<void>((resolve, reject) => {
        fs.writeFile(path, content, (err, data) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(data);
            }
        });
    });
}

function fsMakeDirectory(path: string) {
    return new Promise<void>((resolve, reject) => {
        fs.mkdir(path, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        })
    })
}
function fsExists(path: string) {
    return new Promise<boolean>((resolve, reject) => {
        fs.exists(path, (exists) => {
            resolve(exists);
        });
    });
}
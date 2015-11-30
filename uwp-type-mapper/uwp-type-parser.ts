"use strict";

import * as jsdom from "jsdom"
import * as fspromise from "./fspromise"

export interface TypeNotation {
    description: string;
    type: string;
}

export interface FunctionTypeNotation {
    description: ""; // describe in signature object
    type: "function";
    signatures: FunctionSignature[];
}
export interface DelegateTypeNotation {
    description: "";
    type: "delegate";
    signature: FunctionSignature;
}
export interface FunctionSignature {
    description: string;
    parameters: DescribedKeyTypePair[];
    return: "instance" | TypeNotation;
    codeSnippet: string;
}
export interface DescribedKeyTypePair {
    description: string;
    type: string;
    key: string;
}

export interface EventTypeNotation {
    description: string;
    type: "event";
    delegate: string;
}
export interface StructureTypeNotation {
    description: string;
    type: "structure";
    members: DescribedKeyTypePair[];
}

export default async function parse() {
    return objectify(await parseAsMap());

    function objectify(map: Map<string, TypeNotation>) {
        let ob: any = {};
        let sortedEntries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        for (let entry of sortedEntries) {
            ob[entry[0]] = entry[1];
        }
        return ob;
    }
}

async function parseAsMap() {
    /*
    TODO: This function should ultimately return fully formatted JSON object:
    {
        "documentType": "namespace",
        "syntax": {
            "codeSnippets": {
                "JavaScript": "...",
                "C++": "..."
            }
        },
        // ...
    }
    */
    let referenceMap = new Map<string, TypeNotation>();

    let referencepath = "../referencedocs";
    let mshelppath = "ms-xhelp:///?Id=T%3a";
    let bracketRegex = /\[[^\[]*\]/;
    let parenthesisRegex = /\([^\(]*\)/;
    let whitespaceRepeatRegex = /\s{1,}/g;
    let eventListenerRegex = /\w+\.addEventListener\(\"(\w+)\"\, \w+\)/;
    let oneventRegex = /\w+\.on(\w+) =/;
    let files = await findAllHTMLFilePaths(referencepath);
    let skippedById: string[] = [];

    let i = 0;
    let length = files.length;
    for (let filepath of files) {
        i++;
        console.log(`Parsing ${filepath} (${(i / length * 100).toFixed(4)} %, skipping ${skippedById.length} out of ${length} docs)...`);
        try {
            let text = await fspromise.readFile(`${referencepath}/${filepath}`);
            let doc = jsdom.jsdom(text) as Document;
            let metaHelpId = doc.head.querySelector("meta[name=Microsoft\\.Help\\.Id]") as HTMLMetaElement;
            if (!metaHelpId)
                continue;
            let helpId = metaHelpId.content.toLowerCase();
            let categoryJs = Array.from(doc.head.querySelectorAll("meta[name=Microsoft\\.Help\\.Category]")).filter((meta: HTMLMetaElement) => meta.content === "DevLang:javascript")[0];
            let startIndex = helpId.indexOf(":windows");
            if (startIndex !== -1) {
                helpId = helpId.slice(startIndex + 1);
            }
            else {
                skippedById.push(doc.title);
                continue;
            }
            if (!categoryJs || helpId.startsWith("windows.ui.xaml")) {
                skippedById.push(doc.title);
                continue; // Do not parse XAML API
            }
            // TODO: use target language meta tag? it can only be used with VS document
            let mainSection = doc.body.querySelector("div#mainSection") as HTMLDivElement;
            let mainContent = mainSection.textContent
            let description = getFirstParagraphText(mainSection.firstElementChild, "H2");
            let title = doc.body.querySelector("div.title").textContent.trim();

            if (title.endsWith(" class") || title.endsWith(" attribute")) {
                // https://msdn.microsoft.com/en-us/library/windows/apps/windows.applicationmodel.background.smartcardtrigger.aspx

                referenceMap.set(helpId, {
                    description,
                    type: "class"
                } as TypeNotation);
            }
            else if (title.endsWith(" enumeration")) {
                // Example URL: https://msdn.microsoft.com/en-us/library/windows/apps/windows.devices.pointofservice.posprintercartridgesensors.aspx

                referenceMap.set(helpId, {
                    description,
                    type: "enumeration"
                } as TypeNotation);

                let before = Array.from(mainSection.querySelectorAll("h2")).filter((h2) => h2.textContent.trim().startsWith("Members"))[0];
                let table = before.nextElementSibling.nextElementSibling as HTMLTableElement;

                if (table.tagName !== "TABLE") {
                    throw new Error("Unexpected enumeration document format");
                }

                let rows = Array.from(table.rows).slice(1) as HTMLTableRowElement[];

                for (let row of rows) {
                    let nameCol = row.children[0] as HTMLTableColElement;
                    let descCol = row.children[2] as HTMLTableColElement;
                    if (nameCol.children.length > 1) {
                        referenceMap.set(`${helpId}.${nameCol.children[1].textContent.trim().toLowerCase()}`, {
                            description: getFirstParagraphText(descCol.firstElementChild),
                            type: "Number"
                        });
                    }
                    else if (categoryJs) {
                        debugger;
                    }
                }

            }
            else if (title.endsWith(" namespace")) {
                referenceMap.set(helpId, {
                    description,
                    type: "namespace"
                } as TypeNotation);
            }
            else if (title.endsWith(" property")) {
                // example URL: https://msdn.microsoft.com/en-us/library/windows/apps/windows.applicationmodel.background.smartcardtrigger.triggertype.aspx
                
                let before = Array.from(mainSection.querySelectorAll("h2")).filter((h2) => h2.textContent.trim().startsWith("Property value"))[0];
                let typeNotationParagraph = before.nextElementSibling;
                let type = exportJavaScriptTypeNotation(parseTypeNotationElement(typeNotationParagraph as HTMLParagraphElement));
                if (!type) {
                    // JS incompatble
                    continue;
                }

                referenceMap.set(helpId, {
                    description,
                    type
                } as TypeNotation);
            }
            else if (title.endsWith(" delegate")) {
                // example URL: https://msdn.microsoft.com/en-us/library/windows/apps/br206577.aspx, https://msdn.microsoft.com/en-us/library/windows/apps/br225997.aspx

                let signature = {
                    description: "",
                    parameters: undefined,
                    return: undefined
                } as FunctionSignature;

                let before = Array.from(mainSection.querySelectorAll("h2")).filter((h2) => h2.textContent.trim().startsWith("Parameters"))[0];
                let parameterListElement = before.nextElementSibling as HTMLDListElement;
                signature.parameters = parseParameterList(parameterListElement);
                if (!signature.parameters) {
                    // JS incompatible
                    continue;
                }

                referenceMap.set(helpId, {
                    description,
                    type: "delegate",
                    signature
                } as DelegateTypeNotation);
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
                    return: "instance",
                    codeSnippet: undefined
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
                    description
                } as FunctionSignature;

                let codeSnippetText = extractSyntaxCodeSnippets(mainSection).get("JavaScript")
                if (codeSnippetText == null) {
                    throw new Error("No JS code snippet");
                }
                signature.codeSnippet = codeSnippetText;

                let parentheses = parenthesisRegex.exec(helpId);
                if (parentheses) {
                    helpId = helpId.slice(0, parentheses.index);
                } // may exist when with params, may not when without

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

                    let type: string
                    if (typeNotationElement.children.length > 0) {
                        type = exportJavaScriptTypeNotation(parseTypeNotationElement(typeNotationElement));
                        if (!type) {
                            // JS incompatible
                            continue;
                        }
                    }
                    else {
                        // Some document has "Return value" header but does not have type notation
                        // https://msdn.microsoft.com/en-us/library/windows/apps/windows.applicationmodel.calls.phonecallhistorystore.getentryasync.aspx?cs-save-lang=1&cs-lang=javascript#code-snippet-1
                        type = "unknown";
                    }

                    signature.return = {
                        description: inline(typeDescriptionElement.textContent),
                        type
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
            else if (title.endsWith(" event")) {
                // Example URL: https://msdn.microsoft.com/en-us/library/windows/apps/windows.media.capture.core.variablephotosequencecapture.photocaptured.aspx

                let codeSnippetText = extractSyntaxCodeSnippets(mainSection).get("JavaScript")
                if (codeSnippetText == null) {
                    throw new Error("No JS code snippet");
                }

                let eventListener = codeSnippetText.match(eventListenerRegex);
                let onevent = codeSnippetText.match(oneventRegex);

                let before = Array.from(mainSection.querySelectorAll("h2")).filter((h2) => h2.textContent.trim().startsWith("Event information"))[0];
                let table = before.nextElementSibling as HTMLTableElement;
                let rows = Array.from(table.rows) as HTMLTableRowElement[];
                if (rows.length > 1) {
                    debugger;
                    throw new Error("Unexpected multiple table rows");
                }
                let header = rows[0].children[0];
                let typeNotationElement = rows[0].children[1];
                let delegate = exportJavaScriptTypeNotation(parseTypeNotationElement(typeNotationElement as HTMLTableColElement, true))
                if (!delegate) {
                    // JS compatibility is already checked above
                    throw new Error("Expected JS type but not found");
                }

                if (!eventListener || !onevent) {
                    debugger;
                    throw new Error("Expected both event listener/onevent syntax but not found");
                }
                referenceMap.set(addOnPrefixOnHelpId(helpId), {
                    description,
                    type: "event",
                    delegate
                } as EventTypeNotation);
            }
            else if (title.endsWith(" structure")) {
                /*
                There is (are): https://msdn.microsoft.com/en-us/library/windows/apps/windows.foundation.rect.aspx
                Parsing this will not be used on mapping, how can it be used to generate d.ts?
                Manually point and add them?
                
                Namespace should reference them so that mapper can know
                */
                let notation = {
                    description,
                    type: "structure",
                    members: []
                } as StructureTypeNotation;

                let membersHeader2 = Array.from(mainSection.querySelectorAll("h2")).filter((h2) => h2.textContent.trim().startsWith("Members"))[0];
                let tableOrList = membersHeader2.nextElementSibling.nextElementSibling;
                let table: HTMLTableElement;
                if (tableOrList.tagName === "UL") {
                    // Rich structure (not in JS)
                    let before = Array.from(mainSection.querySelectorAll("h3")).filter((h3) => h3.textContent.trim().startsWith("Fields"))[0];
                    table = before.nextElementSibling.nextElementSibling as HTMLTableElement;
                }
                else if (tableOrList.tagName === "TABLE") {
                    table = tableOrList as HTMLTableElement;
                }
                else if (tableOrList.tagName !== "H2" /* next header */) {
                    throw new Error("Unexpected element type after Members header");
                }

                if (!table) {
                    // empty structure (will be written as 'any' later")
                    referenceMap.set(helpId, notation);
                    continue;
                }

                let rows = Array.from(table.rows).slice(1) as HTMLTableRowElement[];
                for (let row of rows) {
                    let memberName = parseMemberName(row.children[0] as HTMLTableColElement);
                    let memberType = exportJavaScriptTypeNotation(parseTypeNotationElement((row.children[1] as HTMLTableColElement).children[0] as HTMLParagraphElement, true));
                    let memberDescription = row.children[2].textContent.trim();
                    notation.members.push({
                        description: memberDescription,
                        key: memberName[1],
                        type: memberType
                    });
                }
                referenceMap.set(helpId, notation);
            }
            else if (title.endsWith(" interface")) {
                continue;
            }
            else if (title.endsWith(" constructors") || title.endsWith(" methods") || title === "Content Removed") {
                continue; // Do not parse meta pages
            }
            else {
                debugger;
                continue;
            }
        }
        catch (e) {
            throw new Error(`An error is thrown from ${filepath}: ${e.message}`);
        }
    }

    return referenceMap;

    function getFirstParagraphText(element: Element, beforeElement?: string) {
        let nextElement = element;
        while (nextElement && nextElement.tagName !== beforeElement) {
            if (nextElement.tagName === "P") {
                return inline(nextElement.textContent.trim());
            }
            nextElement = nextElement.nextElementSibling;
        }
    }
    function extractSyntaxCodeSnippets(mainSection: HTMLDivElement) {
        let before = Array.from(mainSection.querySelectorAll("h2")).filter((h2) => h2.textContent.trim().startsWith("Syntax"))[0];
        let snippetMap = new Map<string, string>();
        if (!before) {
            return snippetMap;
        }

        let codesnippetElement = before.nextElementSibling;
        while (codesnippetElement && codesnippetElement.tagName === "CODESNIPPET") {
            let language = codesnippetElement.getAttribute("language")
            if (!language) {
                throw new Error("CODESNIPPET element does not have 'language' attribute");
            }
            snippetMap.set(language, codesnippetElement.textContent);

            codesnippetElement = codesnippetElement.nextElementSibling;
        }
        return snippetMap;
    }
    function addOnPrefixOnHelpId(helpId: string) {
        let lastDotIndex = helpId.lastIndexOf(".");
        if (lastDotIndex === -1) {
            throw new Error("Incorrect help ID");
        }
        let base = helpId.slice(0, lastDotIndex);
        let shortName = helpId.slice(lastDotIndex + 1);

        return `${base}.on${shortName}`
    }

    function parseParameterList(listElement: HTMLDListElement): DescribedKeyTypePair[] {
        let parameters: DescribedKeyTypePair[] = [];
        let childItems = Array.from(listElement.children) as HTMLElement[];

        let parameterName: string;
        for (let child of childItems) {
            if (child.tagName === "DT") {
                parameterName = child.textContent.trim();
            }
            else if (child.tagName === "DD") {
                let parameterType = exportJavaScriptTypeNotation(parseTypeNotationElement(child.children[0] as HTMLParagraphElement));
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

    function parseTypeNotationElement(notationElement: HTMLElement, omitTypeIndication?: boolean): string | Map<string, string> {
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
        // TODO: Fix "array of " problem https://msdn.microsoft.com/en-us/library/windows/apps/windows.media.protection.playready.nddownloadenginenotifier.ondatareceived.aspx
        let typeMap = new Map<string, string>();

        let node = notationElement.firstChild;
        
        let typeNotationPrefix: string;
        if (!omitTypeIndication) {
            if (isText(node) && node.textContent.indexOf("Type:") === 0) {
                let sliced = node.textContent.slice(5).trim();
                if (sliced === "array of") {
                    typeNotationPrefix = sliced;
                }
                else if (sliced.length > 0) {
                    let parsed = parseTypeNotationString(sliced);
                    if (!parsed.type) {
                        debugger;
                        throw new Error("Unexpected empty type name");
                    }

                    if (typeNotationPrefix) {
                        parsed.type = `${typeNotationPrefix} ${parsed.type}`;
                        typeNotationPrefix = undefined;
                    }
                    if (parsed.languages) {
                        for (let language of parsed.languages) {
                            typeMap.set(language, parsed.type);
                        }
                    }
                    else {
                        return parsed.type
                    }
                }
            }
            else {
                debugger;
                throw new Error("Incorrect type description");
            }
            node = node.nextSibling;
        }

        // https://msdn.microsoft.com/en-us/library/windows/apps/windows.system.memorymanager.appmemoryusagelimitchanging.aspx
        // TODO: use text node parser also in below code

        let proposedTypeName: string;
        let trimmedTextContent: string;
        while (node) {
            trimmedTextContent = node.textContent.trim();
            if (isElement(node)) {
                if (isAnchorElement(node)) {
                    proposedTypeName = decodeURI(node.href.slice(mshelppath.length));
                }
                else if (node.tagName === "STRONG" || node.tagName === "SPAN") {
                    proposedTypeName = trimmedTextContent
                }
                else if (node.tagName === "P") {
                    break;
                }
                else {
                    debugger;
                    throw new Error("Unexpected element");
                }
            }
            else if (isText(node) && trimmedTextContent.length > 0) {
                if (trimmedTextContent === "array of") {
                    typeNotationPrefix = trimmedTextContent;
                }
                else {
                    let parsed = parseTypeNotationString(trimmedTextContent);
                    if (parsed.type) {
                        proposedTypeName = parsed.type;
                    }
                    if (typeNotationPrefix) {
                        proposedTypeName = `${typeNotationPrefix} ${proposedTypeName}`;
                        typeNotationPrefix = undefined;
                    }
                    if (parsed.languages) {
                        for (let language of parsed.languages) {
                            typeMap.set(language, proposedTypeName);
                        }
                    }
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

        interface TypeForLanguage {
            type?: string;
            languages?: string[];
        }
        function parseTypeNotationString(text: string) {
            /*
            "typeName [languageName]" -> { type: typeName, languages: [languageName] }
            "[languageName]" -> { languages: [languageName] }
            */
            let brackets = bracketRegex.exec(text);
            if (brackets) {
                let languages = parseLanguageIndicator(text.substr(brackets.index, brackets[0].length))
                // language name, type name
                return { type: text.slice(0, brackets.index).trim(), languages } as TypeForLanguage
            }
            else {
                return { type: text } as TypeForLanguage;
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
    }

    function parseMemberName(element: HTMLElement) {
        let names = Array.from(element.getElementsByTagName("strong"));
        if (names.length !== 2) {
            throw new Error("Unexpected name numbers");
        }
        return names.map((strong) => strong.textContent.trim());
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

function isText(node: Node): node is Text {
    return node.nodeType === 3;
}
function isElement(node: Node): node is Element {
    return node.nodeType === 1;
}
function isAnchorElement(element: Element): element is HTMLAnchorElement {
    return element.tagName === "A";
}

async function findAllHTMLFilePaths(directory: string) {
    let htmlFilePaths: string[] = [];
    await findHTMLFilePaths(directory);
    return htmlFilePaths;

    async function findHTMLFilePaths(directory: string) {
        let paths = await fspromise.readDirectory(directory);
        for (let path of paths) {
            let fullPath = `${directory}/${path}`;
            let stat = await fspromise.stat(fullPath);
            if (stat.isDirectory()) {
                await findHTMLFilePaths(fullPath);
            }
            else if (stat.isFile() && (path.endsWith(".htm") || path.endsWith(".html"))) {
                htmlFilePaths.push(fullPath);
            }
        }
    }
}
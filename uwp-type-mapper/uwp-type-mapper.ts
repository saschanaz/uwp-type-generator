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
        let files = await fsReadFiles(referencepath);

        for (let filepath of files) {
            let text = await fsReadFile(`${referencepath}/${filepath}`);
            let doc = jsdom.jsdom(text) as Document;
            let meta = doc.head.querySelector("meta[name$=F1]") as HTMLMetaElement;
            if (!meta)
                continue;
            let f1 = meta.content.toLowerCase();
            let mainSection = doc.body.querySelector("div#mainSection");
            let mainContent = mainSection.textContent
            let desciption = mainContent.slice(0, mainContent.search(/\sSyntax\s/)).trim().replace(/\s{1,}/g, " ");
            let title = doc.body.querySelector("div.title").textContent.trim();
            let type: string;
            if (title.endsWith(" class")) {
                type = "class";
            }
            else if (title.endsWith(" property")) {
                let before = Array.from(mainSection.querySelectorAll("h2")).filter((h2) => h2.textContent.trim().startsWith("Property value"))[0]
                if (before) {
                    let typeDescriptor = before.nextElementSibling.textContent.trim().replace(/\s{1,}/g, " ");
                    let typeTextIndex = typeDescriptor.indexOf("Type:");
                    let jsIndicationIndex = typeDescriptor.indexOf("[");
                    if (jsIndicationIndex !== -1) {
                        type = typeDescriptor.slice(typeTextIndex + 5, jsIndicationIndex).trim();
                    }
                    else {
                        type = typeDescriptor.slice(typeTextIndex + 5).trim();
                    }
                }
                else {
                    debugger;
                }
            }


            referenceMap[f1] = {
                desciption,
                type
            } as Reference;
        }

        return referenceMap;
    }
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
declare var log: HTMLParagraphElement;

//interface Reference {
//    desciption: string;
//    signatures: FunctionSignature[];
//    type: string;
//}

//interface FunctionSignature {
//    parameters: KeyTypePair[];// 
//    return: string;
//}
//interface KeyTypePair {
//    key: string;
//    type: string;
//}

type TypeDescription = { __type: "unknown" | "class" | "structure"; __fullname: string };
type TypeNameOrDescription = string | TypeDescription;

async function generate() {
    //let referenceMap: { [key: string]: Reference } = {};
    //try {
    //    await map();
    //}
    //catch (e) {
    //    debugger;
    //}
    //await enumerate("Windows", Windows);

    async function enumerate(namespace: string, obj: any) {
        for (var itemName in obj) {
            let item = obj[itemName];
            let fullName = `${namespace}.${itemName}`;
            let type = typeof item;
            if ((itemName as string)[0].toUpperCase() === itemName[0]) {
                // Assume that upper cased item is a namespace
                if (item != null) {
                    if (type === "object") {
                        await write(fullName);
                        await enumerate(fullName, item);
                    }
                    else {
                        await write(`${fullName}: class extends ${item.prototype.__proto__.constructor.name}`);
                        await enumerate(fullName, item); // static member
                        await enumerateMember(fullName, item);
                    }
                }
                else {
                    await write(`${fullName}: ${item}`);
                }
            }
            else {
                if (type === "object") {
                    type = item.prototype.constructor.name;
                }
                await write(`${fullName}: ${type}`);
            }
        }
    }
    async function enumerateMember(fullName: string, constructor: any) {
        for (let memberName of Object.getOwnPropertyNames(constructor.prototype)) {
            let memberFullName = `${fullName}.${memberName}`;
            let mappedType = referenceMap[memberFullName.toLowerCase()];
            await write(`${fullName}.${memberName} (member): ${mappedType && mappedType.type}`);
        }
    }

    //async function map() {
    //    let apppath = await Windows.ApplicationModel.Package.current.installedLocation;
    //    let referencepath = await apppath.getFolderAsync("referencedocs");
    //    let files = await referencepath.getFilesAsync();
        
    //    for (let file of <Windows.Storage.StorageFile[]><any>files) {
    //        let text = await Windows.Storage.FileIO.readTextAsync(file);
    //        let doc = new DOMParser().parseFromString(text, "text/html");
    //        let meta = doc.head.querySelector("meta[name$=F1]") as HTMLMetaElement;
    //        if (!meta)
    //            continue;
    //        let f1 = meta.content.toLowerCase();
    //        let mainSection = doc.body.querySelector("div#mainSection");
    //        let mainContent = mainSection.textContent
    //        let desciption = mainContent.slice(0, mainContent.search(/\sSyntax\s/)).trim().replace(/\s{1,}/g, " ");
    //        let title = doc.body.querySelector("div.title").textContent.trim();
    //        let type: string;
    //        if (title.endsWith(" class")) {
    //            type = "class";
    //        }
    //        else if (title.endsWith(" property")) {
    //            let before = Array.from(mainSection.querySelectorAll("h2")).filter((h2) => h2.textContent.trim().startsWith("Property value"))[0]
    //            if (before) {
    //                let typeDescriptor = before.nextElementSibling.textContent.trim().replace(/\s{1,}/g, " ");
    //                let typeTextIndex = typeDescriptor.indexOf("Type:");
    //                let jsIndicationIndex = typeDescriptor.indexOf("[");
    //                if (jsIndicationIndex !== -1) {
    //                    type = typeDescriptor.slice(typeTextIndex + 5, jsIndicationIndex).trim();
    //                }
    //                else {
    //                    type = typeDescriptor.slice(typeTextIndex + 5).trim();
    //                }
    //            }
    //            else {
    //                debugger;
    //            }
    //        }


    //        referenceMap[f1] = {
    //            desciption,
    //            type
    //        } as Reference;
    //    }
    //}
    
    async function write(text: string) {
        let p = document.createElement("p");
        p.textContent = text;
        log.appendChild(p);
        await Promise.resolve();
    }
}
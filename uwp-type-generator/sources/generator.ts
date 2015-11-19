declare var log: HTMLDivElement;

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

interface TypeDescription { __type: "class" | "structure"; __fullname: string; };
type TypeNameOrDescription = string | TypeDescription;

interface ClassDescription { __type: "class"; __fullname: string; __extends: TypeDescription; prototype: TypeDescription; }

async function generate() {
    //let referenceMap: { [key: string]: Reference } = {};
    //try {
    //    await map();
    //}
    //catch (e) {
    //    debugger;
    //}
    try {
        return await enumerate("Windows", Windows);
    }
    catch (e) {
        debugger;
    }

    async function enumerate(fullName: string, namespace: any) {
        let description = {
            __type: "structure", __fullname: fullName
        } as TypeDescription;

        let properties = new Set(Object.getOwnPropertyNames(namespace));
        properties.delete("length");
        properties.delete("name");
        properties.delete("caller");
        properties.delete("arguments");
        properties.delete("toString");
        properties.delete("constructor"); // should be added by mapper

        for (let itemName in namespace) {
            let item: any;
            try {
                item = namespace[itemName];
            }
            catch (e) {
                description[itemName] = "unknown";
                // Some class constructor exposes static properties that allow access only in specific environment
                // e.g. Windows.ApplicationModel.Store.CurrentApp
            }
            let itemFullName = `${fullName}.${itemName}`;
            let type = typeof item;
            if ((itemName as string)[0].toUpperCase() === itemName[0]) {
                // Assume that upper cased item is a namespace
                if (item != null) {
                    if (type === "object") {
                        await write(itemFullName);
                        description[itemName] = await enumerate(itemFullName, item);
                    }
                    else {
                        await write(`${itemFullName}: class extends ${item.prototype.__proto__.constructor.name}`);
                        description[itemName] = await enumerateClass(itemFullName, item);
                    }
                }
                else {
                    await write(`${itemFullName}: ${item}`);
                    description[itemName] = item === null ? "null" : "undefined";
                }
            }
            else {
                if (type === "object") {
                    if (item !== null) {
                        type = item.__proto__.constructor.name;
                    }
                    else { // null
                        type = "null";
                    }
                }
                description[itemName] = type;
                await write(`${itemFullName}: ${type}`);
            }
        }
        return description;
    }

    async function enumerateClass(fullname: string, constructor: any) {
        let description = await enumerate(fullname, constructor) as ClassDescription;
        description.__type = "class";
        description.__extends = constructor.prototype.__proto__.constructor.name;
        description.prototype = await enumerateMember(fullname, constructor);

        return description;
    }

    async function enumerateMember(fullName: string, constructor: any) {
        let description = {
            __type: "structure", __fullname: fullName
        } as TypeDescription;
        let properties = new Set(Object.getOwnPropertyNames(constructor.prototype));
        properties.delete("toString");
        properties.delete("constructor");
        for (let memberName of properties) {
            let memberFullName = `${fullName}.${memberName}`;
            description[memberName] = "unknown";
            await write(`${memberFullName} (member)`);
        }
        return description;
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
        if (log.children.length > 100) {
            log.firstElementChild.remove();
        }
        await Promise.resolve();
    }
}

async function save(result: string) {
    let picker = new Windows.Storage.Pickers.FileSavePicker();
    picker.fileTypeChoices.insert("JSON format", [".json"] as any);
    let file = await picker.pickSaveFileAsync();
    let writeStream = await file.openAsync(Windows.Storage.FileAccessMode.readWrite);
    let datawriter = new Windows.Storage.Streams.DataWriter(writeStream);
    datawriter.writeString(JSON.stringify(result, null, 2));
    await datawriter.storeAsync();
    await writeStream.flushAsync();
    writeStream.close();
    await datawriter.flushAsync();
    datawriter.dispose();
}

/// <reference path="declarations/winrt.d.ts" />

declare var log: HTMLDivElement;

export interface TypeDescription { __type: string; __fullname: string; __description?: string;[key: string]: any }
export type TypeNameOrDescription = string | TypeDescription;

export interface ClassDescription extends TypeDescription { __type: "class"; __extends: string; __eventTarget?: boolean; prototype: TypeDescription; }

async function generate() {
    try {
        return await enumerate("Windows", Windows);
    }
    catch (e) {
        debugger;
    }

    async function enumerate(fullName: string, namespace: any) {
        /* Just structures, classes, and nothing else in an iteration file */
        let description = {
            __type: "structure", __fullname: fullName
        } as TypeDescription;

        let properties = new Set(Object.getOwnPropertyNames(namespace));
        if (namespace instanceof Function) {
            properties.delete("length");
            properties.delete("name");
            properties.delete("caller");
            properties.delete("arguments");
            properties.delete("prototype"); // will be processed later
        }
        properties.delete("toString");
        properties.delete("constructor"); // should be added by mapper

        for (let itemName of properties) {
            let itemFullName = `${fullName}.${itemName}`;
            if ((itemName as string)[0].toUpperCase() !== itemName[0]) {
                // Not starts with capital letter
                await write(`${itemFullName}`);
                description[itemName] = "unknown";
                continue;
            }

            let item = namespace[itemName];
            let type = typeof item;
            if (item != null) {
                // Assume that upper cased item is a namespace or a class
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
                await write(`${itemFullName}: void`);
                description[itemName] = item === null ? "unknown" : "undefined";
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
    writeStream.size = 0;

    let datawriter = new Windows.Storage.Streams.DataWriter(writeStream);
    datawriter.writeString(JSON.stringify(result, null, 2));
    await datawriter.storeAsync();
    await writeStream.flushAsync();
    writeStream.close();
    await datawriter.flushAsync();
    datawriter.dispose();
}

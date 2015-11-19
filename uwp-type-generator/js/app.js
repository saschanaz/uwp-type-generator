var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, Promise, generator) {
    return new Promise(function (resolve, reject) {
        generator = generator.call(thisArg, _arguments);
        function cast(value) { return value instanceof Promise && value.constructor === Promise ? value : new Promise(function (resolve) { resolve(value); }); }
        function onfulfill(value) { try { step("next", value); } catch (e) { reject(e); } }
        function onreject(value) { try { step("throw", value); } catch (e) { reject(e); } }
        function step(verb, value) {
            var result = generator[verb](value);
            result.done ? resolve(result.value) : cast(result.value).then(onfulfill, onreject);
        }
        step("next", void 0);
    });
};
function generate() {
    return __awaiter(this, void 0, Promise, function* () {
        //let referenceMap: { [key: string]: Reference } = {};
        //try {
        //    await map();
        //}
        //catch (e) {
        //    debugger;
        //}
        //await enumerate("Windows", Windows);
        function enumerate(namespace, obj) {
            return __awaiter(this, void 0, Promise, function* () {
                for (var itemName in obj) {
                    let item = obj[itemName];
                    let fullName = `${namespace}.${itemName}`;
                    let type = typeof item;
                    if (itemName[0].toUpperCase() === itemName[0]) {
                        // Assume that upper cased item is a namespace
                        if (item != null) {
                            if (type === "object") {
                                yield write(fullName);
                                yield enumerate(fullName, item);
                            }
                            else {
                                yield write(`${fullName}: class extends ${item.prototype.__proto__.constructor.name}`);
                                yield enumerate(fullName, item); // static member
                                yield enumerateMember(fullName, item);
                            }
                        }
                        else {
                            yield write(`${fullName}: ${item}`);
                        }
                    }
                    else {
                        if (type === "object") {
                            type = item.prototype.constructor.name;
                        }
                        yield write(`${fullName}: ${type}`);
                    }
                }
            });
        }
        function enumerateMember(fullName, constructor) {
            return __awaiter(this, void 0, Promise, function* () {
                for (let memberName of Object.getOwnPropertyNames(constructor.prototype)) {
                    let memberFullName = `${fullName}.${memberName}`;
                    let mappedType = referenceMap[memberFullName.toLowerCase()];
                    yield write(`${fullName}.${memberName} (member): ${mappedType && mappedType.type}`);
                }
            });
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
        function write(text) {
            return __awaiter(this, void 0, Promise, function* () {
                let p = document.createElement("p");
                p.textContent = text;
                log.appendChild(p);
                yield Promise.resolve();
            });
        }
    });
}

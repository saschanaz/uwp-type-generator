/// <reference path="declarations/winrt.d.ts" />
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
;
function generate() {
    return __awaiter(this, void 0, Promise, function* () {
        try {
            return yield enumerate("Windows", Windows);
        }
        catch (e) {
            debugger;
        }
        function enumerate(fullName, namespace) {
            return __awaiter(this, void 0, Promise, function* () {
                let description = {
                    __type: "structure", __fullname: fullName
                };
                let properties = new Set(Object.getOwnPropertyNames(namespace));
                if (namespace instanceof Function) {
                    properties.delete("length");
                    properties.delete("name");
                    properties.delete("caller");
                    properties.delete("arguments");
                }
                properties.delete("toString");
                properties.delete("constructor"); // should be added by mapper
                for (let itemName in namespace) {
                    let item;
                    try {
                        item = namespace[itemName];
                    }
                    catch (e) {
                        description[itemName] = "unknown";
                    }
                    let itemFullName = `${fullName}.${itemName}`;
                    let type = typeof item;
                    if (itemName[0].toUpperCase() === itemName[0]) {
                        // Assume that upper cased item is a namespace
                        if (item != null) {
                            if (type === "object") {
                                yield write(itemFullName);
                                description[itemName] = yield enumerate(itemFullName, item);
                            }
                            else {
                                yield write(`${itemFullName}: class extends ${item.prototype.__proto__.constructor.name}`);
                                description[itemName] = yield enumerateClass(itemFullName, item);
                            }
                        }
                        else {
                            yield write(`${itemFullName}: ${item}`);
                            description[itemName] = item === null ? "null" : "undefined";
                        }
                    }
                    else {
                        if (type === "object") {
                            if (item !== null) {
                                type = item.__proto__.constructor.name;
                            }
                            else {
                                type = "null";
                            }
                        }
                        description[itemName] = type;
                        yield write(`${itemFullName}: ${type}`);
                    }
                }
                return description;
            });
        }
        function enumerateClass(fullname, constructor) {
            return __awaiter(this, void 0, Promise, function* () {
                let description = yield enumerate(fullname, constructor);
                description.__type = "class";
                description.__extends = constructor.prototype.__proto__.constructor.name;
                description.prototype = yield enumerateMember(fullname, constructor);
                return description;
            });
        }
        function enumerateMember(fullName, constructor) {
            return __awaiter(this, void 0, Promise, function* () {
                let description = {
                    __type: "structure", __fullname: fullName
                };
                let properties = new Set(Object.getOwnPropertyNames(constructor.prototype));
                properties.delete("toString");
                properties.delete("constructor");
                for (let memberName of properties) {
                    let memberFullName = `${fullName}.${memberName}`;
                    description[memberName] = "unknown";
                    yield write(`${memberFullName} (member)`);
                }
                return description;
            });
        }
        function write(text) {
            return __awaiter(this, void 0, Promise, function* () {
                let p = document.createElement("p");
                p.textContent = text;
                log.appendChild(p);
                if (log.children.length > 100) {
                    log.firstElementChild.remove();
                }
                yield Promise.resolve();
            });
        }
    });
}
function save(result) {
    return __awaiter(this, void 0, Promise, function* () {
        let picker = new Windows.Storage.Pickers.FileSavePicker();
        picker.fileTypeChoices.insert("JSON format", [".json"]);
        let file = yield picker.pickSaveFileAsync();
        let writeStream = yield file.openAsync(Windows.Storage.FileAccessMode.readWrite);
        let datawriter = new Windows.Storage.Streams.DataWriter(writeStream);
        datawriter.writeString(JSON.stringify(result, null, 2));
        yield datawriter.storeAsync();
        yield writeStream.flushAsync();
        writeStream.close();
        yield datawriter.flushAsync();
        datawriter.dispose();
    });
}
//# sourceMappingURL=iterator.js.map
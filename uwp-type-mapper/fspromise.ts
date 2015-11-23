import * as fs from "fs"

export function readFiles(path: string) {
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

export function readFile(path: string) {
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

export function writeFile(path: string, content: string) {
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

export function makeDirectory(path: string) {
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
export function exists(path: string) {
    return new Promise<boolean>((resolve, reject) => {
        fs.exists(path, (exists) => {
            resolve(exists);
        });
    });
}

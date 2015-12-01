"use strict";

export interface Header {
    childNodes: Node[];
    children: Element[];
    subheaders: { [key: string]: Header }
}

export function packByHeader(parent: HTMLElement, parentHeaderLevel?: number) {
    /*
    {
        name: "(name)",
        childNodes: [],

        // assuming that header order does not matter
        subheaders: {
            "(headername)": {
                
                childNodes: [],
                subheaders: {}
            },
        }
    }
    */
    if (parentHeaderLevel == null) {
        parentHeaderLevel = 0;
    }
    let headerRegex = /^H([1-6])$/;
    let currentNode: Node;

    return pack(parent.firstChild, parentHeaderLevel);;

    function pack(target: Node, targetHeaderLevel: number) {
        let result = {
            childNodes: [],
            children: [],
            subheaders: {}
        } as Header;

        currentNode = target;

        while (currentNode) {
            if (currentNode.nodeType === 1) {
                let headerMatch = (currentNode as Element).tagName.match(headerRegex);
                if (headerMatch) {
                    let subHeaderLevel = parseInt(headerMatch[1]);
                    if (subHeaderLevel > targetHeaderLevel) {
                        // higher header level (smaller header)
                        result.subheaders[currentNode.textContent.trim()]
                            = pack(currentNode.nextSibling, subHeaderLevel);
                    }
                    else {
                        // lower header level (larger header)
                        break;
                    }
                }
                else {
                    result.childNodes.push(currentNode);
                    result.children.push(currentNode as Element);
                    currentNode = currentNode.nextSibling;
                }
            }
            else {
                result.childNodes.push(currentNode);
                currentNode = currentNode.nextSibling;
            }

        }

        return result;
    }
}


export function packByCellMatrix(table: HTMLTableElement) {
    let rows = Array.from(table.rows) as HTMLTableRowElement[];
    let arrayTable: HTMLTableColElement[][] = [];
    for (let row of rows) {
        arrayTable.push(Array.from(row.children) as HTMLTableColElement[]);
    }
    return arrayTable;
}

export function packByDeclTerm(dlist: HTMLDListElement) {
    let dlistDict: { [key: string]: HTMLDDElement[] } = {};
    let childItems = Array.from(dlist.children) as HTMLElement[];

    let declTerm: string;
    let arrayDecl: HTMLDDElement[];
    for (let child of childItems) {
        if (child.tagName === "DT") {
            if (declTerm) {
                dlistDict[declTerm] = arrayDecl;
                declTerm = arrayDecl = undefined;
            }
            declTerm = child.textContent.trim();
        }
        else if (child.tagName === "DD") {
            arrayDecl.push(child as HTMLDDElement);
        }
        else {
            debugger;
            throw new Error("Unexpected element");
        }
    }
    if (declTerm) {
        dlistDict[declTerm] = arrayDecl;
        declTerm = arrayDecl = undefined;
    }
    return dlistDict;
}
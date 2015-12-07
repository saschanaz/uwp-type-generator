declare class WinRTError extends Error {
    description: string;
    number: number;
}

declare namespace Windows.Foundation {
    interface IPromise<TResult> {
        then<U>(success?: (value: TResult) => IPromise<U>, error?: (error: any) => IPromise<U>, progress?: (progress: any) => void): IPromise<U>;
        then<U>(success?: (value: TResult) => IPromise<U>, error?: (error: any) => U, progress?: (progress: any) => void): IPromise<U>;
        then<U>(success?: (value: TResult) => U, error?: (error: any) => IPromise<U>, progress?: (progress: any) => void): IPromise<U>;
        then<U>(success?: (value: TResult) => U, error?: (error: any) => U, progress?: (progress: any) => void): IPromise<U>;
        done<U>(success?: (value: TResult) => any, error?: (error: any) => any, progress?: (progress: any) => void): void;

        cancel(): void;
    }
    interface IPromiseWithOperation<TResult, TOperation extends Windows.Foundation.IAsyncAction> extends IPromise<TResult> {
        operation: TOperation;
    }

    interface IAsyncAction {
        completed: Windows.Foundation.AsyncActionCompletedHandler;
        getResults(): void;
    }
    interface IAsyncActionWithProgress<TProgress> {
        progress: Windows.Foundation.AsyncActionProgressHandler<TProgress>;
        completed: Windows.Foundation.AsyncActionWithProgressCompletedHandler<TProgress>;
        getResults(): void;
    }
    interface IAsyncOperation<TResult> {
        completed: Windows.Foundation.AsyncOperationCompletedHandler<TResult>;
        getResults(): TResult;
    }
    interface IAsyncOperationWithProgress<TResult, TProgress> {
        progress: Windows.Foundation.AsyncOperationProgressHandler<TResult, TProgress>;
        completed: Windows.Foundation.AsyncOperationWithProgressCompletedHandler<TResult, TProgress>;
        getResults(): TResult;
    }
    interface IClosable {
        close(): void;
    }

    namespace Collections {
        export interface IIterable<T> {
            first(): Windows.Foundation.Collections.IIterator<T>;
        }
        export interface IIterator<T> {
            current: T;
            hasCurrent: boolean;
            moveNext(): boolean;
            getMany(): { items: T[]; returnValue: number; };
        }
        interface IVectorView<T> extends Windows.Foundation.Collections.IIterable<T>, Array<T> {
            size: number;
            getAt(index: number): T;
            indexOf(value: T): { index: number; returnValue: boolean; };
            getMany(startIndex: number): { items: T[]; returnValue: number; };
        }
        interface IVector<T> extends Windows.Foundation.Collections.IIterable<T>, Array<T> {
            size: number;
            getAt(index: number): T;
            getView(): Windows.Foundation.Collections.IVectorView<T>;
            indexOf(value: T): { index: number; returnValue: boolean; };
            setAt(index: number, value: T): void;
            insertAt(index: number, value: T): void;
            removeAt(index: number): void;
            append(value: T): void;
            removeAtEnd(): void;
            clear(): void;
            getMany(startIndex: number): { items: T[]; returnValue: number; };
            replaceAll(items: T[]): void;
        }
        export interface IKeyValuePair<K, V> {
            key: K;
            value: V;
        }
        export interface IMap<K, V> extends Windows.Foundation.Collections.IIterable<Windows.Foundation.Collections.IKeyValuePair<K, V>> {
            size: number;
            lookup(key: K): V;
            hasKey(key: K): boolean;
            getView(): Windows.Foundation.Collections.IMapView<K, V>;
            insert(key: K, value: V): boolean;
            remove(key: K): void;
            clear(): void;
        }
        export interface IMapView<K, V> extends Windows.Foundation.Collections.IIterable<Windows.Foundation.Collections.IKeyValuePair<K, V>> {
            size: number;
            lookup(key: K): V;
            hasKey(key: K): boolean;
            split(): { first: Windows.Foundation.Collections.IMapView<K, V>; second: Windows.Foundation.Collections.IMapView<K, V>; };
        }
        export interface IObservableVector<T> extends Windows.Foundation.Collections.IVector<T>, Windows.Foundation.Collections.IIterable<T> {
            onvectorchanged: any/* TODO */;
        }
        export interface IObservableMap<K, V> extends Windows.Foundation.Collections.IMap<K, V>, Windows.Foundation.Collections.IIterable<Windows.Foundation.Collections.IKeyValuePair<K, V>> {
            onmapchanged: any/* TODO */;
        }
    }
}
declare namespace Windows.Storage {
    interface IStorageItem {
        attributes: Windows.Storage.FileAttributes;
        dateCreated: Date;
        name: string;
        path: string;
        renameAsync(desiredName: string): Windows.Foundation.IAsyncAction;
        renameAsync(desiredName: string, option: Windows.Storage.NameCollisionOption): Windows.Foundation.IAsyncAction;
        deleteAsync(): Windows.Foundation.IAsyncAction;
        deleteAsync(option: Windows.Storage.StorageDeleteOption): Windows.Foundation.IAsyncAction;
        getBasicPropertiesAsync(): Windows.Foundation.IAsyncOperation<Windows.Storage.FileProperties.BasicProperties>;
        isOfType(type: Windows.Storage.StorageItemTypes): boolean;
    }
    namespace Streams {
        interface IBuffer {
            capacity: number;
            length: number;
        }
        export interface IInputStream extends Windows.Foundation.IClosable {
            readAsync(buffer: Windows.Storage.Streams.IBuffer, count: number, options: Windows.Storage.Streams.InputStreamOptions): Windows.Foundation.IAsyncOperationWithProgress<Windows.Storage.Streams.IBuffer, number>;
        }
        export interface IOutputStream extends Windows.Foundation.IClosable {
            writeAsync(buffer: Windows.Storage.Streams.IBuffer): Windows.Foundation.IAsyncOperationWithProgress<number, number>;
            flushAsync(): Windows.Foundation.IAsyncOperation<boolean>;
        }
    }
}
declare namespace Windows.Data.Xml.Dom {
    interface IXmlNodeSelector {
        selectSingleNode(xpath: string): Windows.Data.Xml.Dom.IXmlNode;
        selectNodes(xpath: string): Windows.Data.Xml.Dom.XmlNodeList;
        selectSingleNodeNS(xpath: string, namespaces: any): Windows.Data.Xml.Dom.IXmlNode;
        selectNodesNS(xpath: string, namespaces: any): Windows.Data.Xml.Dom.XmlNodeList;
    }
    interface IXmlNodeSerializer {
        innerText: string;
        getXml(): string;
    }
    interface IXmlNode extends Windows.Data.Xml.Dom.IXmlNodeSelector, Windows.Data.Xml.Dom.IXmlNodeSerializer {
        attributes: Windows.Data.Xml.Dom.XmlNamedNodeMap;
        childNodes: Windows.Data.Xml.Dom.XmlNodeList;
        firstChild: Windows.Data.Xml.Dom.IXmlNode;
        lastChild: Windows.Data.Xml.Dom.IXmlNode;
        localName: any;
        namespaceUri: any;
        nextSibling: Windows.Data.Xml.Dom.IXmlNode;
        nodeName: string;
        nodeType: Windows.Data.Xml.Dom.NodeType;
        nodeValue: any;
        ownerDocument: Windows.Data.Xml.Dom.XmlDocument;
        parentNode: Windows.Data.Xml.Dom.IXmlNode;
        prefix: any;
        previousSibling: Windows.Data.Xml.Dom.IXmlNode;
        hasChildNodes(): boolean;
        insertBefore(newChild: Windows.Data.Xml.Dom.IXmlNode, referenceChild: Windows.Data.Xml.Dom.IXmlNode): Windows.Data.Xml.Dom.IXmlNode;
        replaceChild(newChild: Windows.Data.Xml.Dom.IXmlNode, referenceChild: Windows.Data.Xml.Dom.IXmlNode): Windows.Data.Xml.Dom.IXmlNode;
        removeChild(childNode: Windows.Data.Xml.Dom.IXmlNode): Windows.Data.Xml.Dom.IXmlNode;
        appendChild(newChild: Windows.Data.Xml.Dom.IXmlNode): Windows.Data.Xml.Dom.IXmlNode;
        cloneNode(deep: boolean): Windows.Data.Xml.Dom.IXmlNode;
        normalize(): void;
    }
}
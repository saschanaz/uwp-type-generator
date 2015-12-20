// Type definitions for Universal Windows Platform
// Project: http://msdn.microsoft.com/en-us/library/windows/apps/br211377.aspx
// Definitions by: Kagami Sascha Rosylight <https://github.com/saschanaz>, Taylor Starfield <https://github.com/taylor224>
// Generator: uwp-type-generator <https://github.com/saschanaz/uwp-type-generator>
// Definitions: https://github.com/borisyankov/DefinitelyTyped

declare interface WinRTError extends Error {
    description: string;
    number: number;
}
declare interface WinRTEvent<TSender> {
    detail: any[];
    target: TSender;
    type: string;
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
    type IPromiseWithIAsyncAction = IPromiseWithOperation<void, IAsyncAction>;
    type IPromiseWithIAsyncActionWithProgress<TProgress> = IPromiseWithOperation<void, IAsyncActionWithProgress<TProgress>>;
    type IPromiseWithIAsyncOperation<TResult> = IPromiseWithOperation<TResult, IAsyncOperation<TResult>>;
    type IPromiseWithIAsyncOperationWithProgress<TResult, TProgress> = IPromiseWithOperation<TResult, IAsyncOperationWithProgress<TResult, TProgress>>;
}

declare namespace Windows.Media.Core {
    interface MseStreamSource { /* TODO, this class is inaccessible on JS environment */ }
}
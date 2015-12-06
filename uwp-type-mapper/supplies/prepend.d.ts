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
}
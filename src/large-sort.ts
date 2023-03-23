import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import * as os from 'os';
import { Transform, Readable, Writable, pipeline } from 'stream'

// Global variable to collect the cleanup functions for all lingering sorts if it can
const TEMP_SORTS_TO_CLEAN_BEFORE_EXIT = new Map<string, () => void>();

function cleanTempFiles(): void {
    for(let cleanFn of TEMP_SORTS_TO_CLEAN_BEFORE_EXIT.values()) {
        try {
            cleanFn()
        } catch {
            // Ignore errors
        }
    }
    TEMP_SORTS_TO_CLEAN_BEFORE_EXIT.clear();
}

function deleteFiles(tempFolder: string) {
    try {
        fs.rmdirSync(tempFolder);
    }
    catch {}
}

// Doing a best effort to clean any lingering split files
process.on('SIGKILL', cleanTempFiles);
process.on('beforeExit', cleanTempFiles);
process.on('exit', cleanTempFiles);

/**
 * The `sortFile()` method sorts the content of an input file and writes the results into an output file.
 * It's designed to handled large files that would not fit into memory by using an external merge sort algorithm.
 * (see: {@link https://en.wikipedia.org/wiki/External_sorting})
 * 
 * This method parses each line of the input file into {@link TValue} instances, sorts them and finally
 * serializes and writes these {@link TValue} instances into lines of the output file via the parameters
 * {@link inputMapFn}, {@link compareFn} and {@link outputMapFn} funtions respectively.
 * 
 * 
 * The sort order is determined by the {@link compareFn} which specifies the precedence of the {@link TValue} instances.
 * @examples
 * - increasing order sort compareFn: (a, b) => a > b? 1 : -1
 * - decreasing order sort compareFn: (a, b) => a < b? 1 : -1
 * 
 * Note:
 * It is recommended to don't specify the {@link linesPerFile} parameter to keep the default value of 100,000.
 * As `sortFile()` has been tested/benchmarked for the best sorting/io performance. It can be specified only 
 * for special scenarios to overcome `too many files` error when other options are not possible or to tune
 * performance for larger `TValue` instances or slow file IO 
 * 
 * When sorting tremendously large files the following error could occur:
 *  ---------------------------------------
 * | `Error: EMFILE, too many open files`  |
 *  ---------------------------------------
 * Which occurs when there input has been splited in more than ~1,024 files and all those files are opened during
 * the k-file merging process.
 * To overcome this the error you'll need to increase the maximum number of concurrent open stream/files limit by
 * using the `$ ulimit -n <max open files (default: 1024)>` command or update the `/etc/security/limit.conf` file.
 * 
 * If above is not possible then you could overcome it by specifying the {@link linesPerFile} parameter above 100,000
 * which could result less split files to merge.
 * 
 * 
 * @template TValue                         - Specifies type of a parsed instance to sort from the input file.
 * 
 * 
 * @param {string}          inputFile       - Location of the input file to sort with data delimited by the
 *                                            {@link inputDelimeter}.
 * @param {string}          outputFile      - Location of output file to write the sorted data delimited by the
 *                                            {@link outputDelimeter}.
 * @param {Function}        inputMapFn      - Function that parses/deserializes an input file line `string` into a
 *                                            {@link TValue} instance.
 * @param {Function}        outputMapFn     - Function that serializes each {@link TValue} instance into a single
 *                                            line `string` of the ouput file.
 * @param {Function}        compareFn       - Function that compares {@link TValue} instances to determine their
 *                                            sort order.
 *                                            See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#parameters}
 * @param {string | RegExp} inputDelimeter  - String or Regex that delimits each input string before been mapped
 *                                            using the {@link inputMapFn} function.
 * @param {string}          outputDelimeter - String delimeter to separate each output string after been mapped to
 *                                            string using the {@link outputMapFn} function.
 * @param {number}          linesPerFile    - Maximum number of lines per temporary split file. Keep default value 
 *                                            of 100K.
 * 
 * 
 * @return {Promise<void>}                  - Promise that once resolved the output sorted file has been completely 
 *                                            created and the temporary files has been cleaned up.
 */
export async function sortFile<TValue>(
    inputFile: string,
    outputFile: string,
    inputMapFn: (x: string) => TValue = x => x as TValue,
    outputMapFn: (x:TValue) => string = x => String(x),
    compareFn: (a:TValue, b:TValue) => number = (a, b) => a > b? 1 : -1,
    inputDelimeter: string | RegExp = '\n',
    outputDelimeter: string = '\n',
    linesPerFile: number = 100_000): Promise<void> {
        const base = path.join(os.tmpdir(), 'large-sort');
        if(!fs.existsSync(base)) {
            fs.mkdirSync(base, {recursive: true});
        }
        const tempFolder = fs.mkdtempSync(path.join(base, "temp_"));
        const tempFiles = new Array<string>();

        TEMP_SORTS_TO_CLEAN_BEFORE_EXIT.set(tempFolder, () => deleteFiles(tempFolder));

        try {
            const inputStream = fs.createReadStream(inputFile, {highWaterMark: (1_000 * 1024), flags: 'r'});

            // Wait till the stream is open
            await new Promise<void>((r) => inputStream.once('open', r));
            await split(inputStream, tempFolder, tempFiles, inputMapFn, JSON.stringify, compareFn, inputDelimeter, linesPerFile);
            inputStream.close();

            const inputBase = path.parse(outputFile).base;
            const tempBase = inputBase + '.temp';
            const tempFile = path.join(tempFolder, tempBase);

            const outputStream = fs.createWriteStream(tempFile, { highWaterMark: 10_000_000, encoding: "utf-8", flags: 'w'});

            // Wait till the result stream is open
            await new Promise<void>((r) => outputStream.once('open', r));
            await merge(tempFiles, outputStream, JSON.parse, outputMapFn, compareFn, outputDelimeter);

            outputStream.close();
            fs.renameSync(tempFile, outputFile);
        }
        finally {
            deleteFiles(tempFolder);
            TEMP_SORTS_TO_CLEAN_BEFORE_EXIT.delete(tempFolder);
        }
}

/**
 * The `sortStream()` method sorts the content from an input Readable stream and writes the results into an 
 * output Writable stream.
 * It's designed to handled large files that would not fit into memory by using an external merge sort algorithm.
 * (see: {@link https://en.wikipedia.org/wiki/External_sorting})
 * 
 * This method parses each line of the input file into {@link TValue} instances, sorts them and finally
 * serializes and writes these {@link TValue} instances into lines of the output file via the parameters
 * {@link inputMapFn}, {@link compareFn} and {@link outputMapFn} funtions respectively.
 * 
 * 
 * The sort order is determined by the {@link compareFn} which specifies the precedence of the {@link TValue} instances.
 * @examples
 * - increasing order sort compareFn: (a, b) => a > b? 1 : -1
 * - decreasing order sort compareFn: (a, b) => a < b? 1 : -1
 * 
 * Note:
 * It is recommended to don't specify the {@link linesPerFile} parameter to keep the default value of 100,000.
 * As `sortStream()` has been tested/benchmarked for the best sorting/io performance. It can be specified only 
 * for special scenarios to overcome `too many files` error when other options are not possible or to tune
 * performance for larger `TValue` instances or slow file IO 
 * 
 * When sorting tremendously large files the following error could occur:
 *  ---------------------------------------
 * | `Error: EMFILE, too many open files`  |
 *  ---------------------------------------
 * Which occurs when there input has been splited in more than ~1,024 files and all those files are opened during
 * the k-file merging process.
 * To overcome this the error you'll need to increase the maximum number of concurrent open stream/files limit by
 * using the `$ ulimit -n <max open files (default: 1024)>` command or update the `/etc/security/limit.conf` file.
 * 
 * If above is not possible then you could overcome it by specifying the {@link linesPerFile} parameter above 100,000
 * which could result less split files to merge.
 * 
 * 
 * @template TValue                         - Specifies type of a parsed instance to sort from the input file.
 * 
 * 
 * @param {Readable}        inputStream     - Input stream to read the data from.
 * @param {Writable}        outputStream    - Writeable stream to output the data.
 * @param {Function}        inputMapFn      - Function that parses/deserializes an input file line `string` into a
 *                                            {@link TValue} instance.
 * @param {Function}        outputMapFn     - Function that serializes each {@link TValue} instance into a single
 *                                            line `string` of the ouput file.
 * @param {Function}        compareFn       - Function that compares {@link TValue} instances to determine their
 *                                            sort order.
 *                                            See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#parameters}
 * @param {string | RegExp} inputDelimeter  - String or Regex that delimits each input string before been mapped
 *                                            using the {@link inputMapFn} function.
 * @param {string}          outputDelimeter - String delimeter to separate each output string after been mapped to
 *                                            string using the {@link outputMapFn}.
 * @param {number}          linesPerFile    - Maximum number of lines per temporary split file. Keep default value 
 *                                            of 100K.
 * 
 * 
 * @return {Promise<void>}                  - Promise that once resolved the output sorted stream has been completely 
 *                                            created and temporary files had been cleaned up.
 */
export async function sortStream<TValue>(
    inputStream: Readable,
    outputStream: Writable,
    inputMapFn: (x: string) => TValue = x => x as TValue,
    outputMapFn: (x:TValue) => string = x => String(x),
    compareFn: (a:TValue, b:TValue) => number = (a, b) => a > b? 1 : -1,
    inputDelimeter: string | RegExp = '\n',
    outputDelimeter: string = '\n',
    linesPerFile: number = 100_000): Promise<void> {
        const base = path.join(os.tmpdir(), 'large-sort');
        if(!fs.existsSync(base)) {
            fs.mkdirSync(base, {recursive: true});
        }
        const tempFolder = fs.mkdtempSync(path.join(base, "temp_"));
        const tempFiles = new Array<string>();

        TEMP_SORTS_TO_CLEAN_BEFORE_EXIT.set(tempFolder, () => deleteFiles(tempFolder));

        try {
            await split(inputStream, tempFolder, tempFiles, inputMapFn, JSON.stringify, compareFn, inputDelimeter, linesPerFile);
            await merge(tempFiles, outputStream, JSON.parse, outputMapFn, compareFn, outputDelimeter);
        }
        finally {
            deleteFiles(tempFolder);
            TEMP_SORTS_TO_CLEAN_BEFORE_EXIT.delete(tempFolder);
        }
}

/**
 * Function to split the file into multiple files with sorted data which are populated to the {@link outputFiles} parameter.
 *
 * @param {Readable}          inputStream      - File path of the
 * @param {string}            splitPath        - The base path on where the files will be splited to.
 * @param {Array<string>}     outputFiles      - List that will be populated with the output files.
 * @param {Function}          inputMapFn       - Function to deserialize the input from each file line into a {@link TValue}.
 * @param {Function}          outputMapFn      - Function serialize each of the {@link TValue} to a string.
 * @param {Function}          compareFn        - Function used to sort the {@link TValue} for each of the files.
 * @param {string}            splitDelimeter   - String delimeter used to file into individual string to be mapped
 * @param {number}            linesPerFile     - How many lines process for each file.
 * 
 * @return {Promise<void>}                     - Promise that once resolved the output sorted file has been completely 
 *                                               created and temporary files has been cleaned up.
 */
async function split<TValue>(
    inputStream: Readable,
    splitPath: string,
    outputFiles: Array<string>,
    inputMapFn: (x: string) => TValue,
    outputMapFn: (x:TValue) => string,
    compareFn: (a:TValue, b:TValue) => number,
    splitDelimeter: string | RegExp,
    linesPerFile: number): Promise<void> {
        let linesLoaded = 0;
        let buffer: Array<TValue> = [];
        let previousRemaingData: string = '';

        // Memory check variable
        const MAX_GB = 1;
        const MAX_BYTES = MAX_GB * 1024 * 1024 * 1024;
        const baseMemoryUsage = process.memoryUsage();
        const bytesToMaxBytes = MAX_BYTES - baseMemoryUsage.heapUsed;
        var current = baseMemoryUsage;
        var nextMemoryCheck = Math.min(1_000, linesPerFile);

        function shouldFlushMemory(bufferSize: number) {
            if(bufferSize !== nextMemoryCheck) return false;

            current = process.memoryUsage();
            const heapDiff = current.heapUsed - baseMemoryUsage.heapUsed;
            const avgBytesPerItem = heapDiff / bufferSize;                
            const maxItems = bytesToMaxBytes / avgBytesPerItem;
            nextMemoryCheck = Math.floor(maxItems * .50);
            return current.heapUsed > MAX_BYTES;
        }

        const transform = new Transform({
            transform(chunk, encoding, callback) {
                const buff = chunk as Buffer;
                const text = buff.toString();
                const lines = text.split(splitDelimeter);

                const end = lines.length - 1;
                lines[0] = previousRemaingData + lines[0];
                previousRemaingData = lines[end];
                for (let i = 0; i < end; i++) {
                    const itemStr = lines[i];
                    try {
                        const mapped = inputMapFn(itemStr);
                        buffer.push(mapped);
                        linesLoaded++;
                    }
                    catch(e) {
                        console.error("[large-sort] ERROR: Mapping from input file failed. error:" + String(e));
                    }
                    // Check if it needs to flush the buffer becuase of the lines per file or because of memory constrain
                    if (buffer.length === linesPerFile || shouldFlushMemory(buffer.length)) {
                        flushBuffer(buffer, linesLoaded, splitPath, outputFiles, outputMapFn, compareFn);
                        buffer.length = 0;
                    }
                }
                callback();
            },
            flush(callback) {
                if(previousRemaingData.trim() != '') {
                    try {
                        const mapped = inputMapFn(previousRemaingData);
                        buffer.push(mapped);
                    }
                    catch(e) {
                        console.error("[large-sort] ERROR: Mapping from input file failed. error:" + String(e));
                    }
                }
                // Process the last buffer if needed
                if(buffer.length !== 0) {
                    flushBuffer(buffer, linesLoaded, splitPath, outputFiles, outputMapFn, compareFn);
                }
                callback();
            }
        });

        await new Promise<void>((resolve, reject) => {
            pipeline(inputStream, transform, (err) => err ? reject(err) : resolve());
        });
}

/**
 * Helper function to process the buffer during the file split.
 * 
 * @param buffer Data buffer to write
 * @param linesLoaded Numbers of already loaded lines
 * @param splitPath Folder where the files are going to be stored
 * @param promises Array of promises to be eventually awaited
 * @param outputFiles Array of the resulting file names.
 * @param outputMapFn Function serialize each of the {@link TValue} to a string.
 * @param compareFn Function used to sort the {@link TValue} for each of the files.
 */
function flushBuffer<TValue>(
    buffer: Array<TValue>,
    linesLoaded: number,
    splitPath: string,
    outputFiles: Array<string>,
    outputMapFn: (x:TValue) => string,
    compareFn: (a:TValue, b:TValue) => number) {
        let sorted = buffer.sort(compareFn);
        let mapped = sorted.map(outputMapFn);
        mapped.push(''); // Extra so it has a new line at the end.

        let toWrite = mapped.join('\n')
        const filename = path.join(splitPath, `large-sort_${String(linesLoaded).padStart(10, '0')}.txt`);
        outputFiles.push(filename);
        return new Promise((resolve) => fs.writeFile(filename, toWrite, resolve));
}

type MergerInfo<T> = {
    data: T,
    done: boolean,
    iter: AsyncIterableIterator<string>,
    reader: readline.Interface,
    readStream: Readable
}

/**
 * Merges multiple sorted files or sorted Readable streams with data separated by a new line into an output 
 * Writeable stream.
 *
 * @param {Readable[] | string[]}   inputs          - List of filenames or Readable streams to merge
 * @param {Writable}                outputStream    - Writeable stream to output the data.
 * @param {Function}                inputMapFn      - Function that parses/deserializes an input file line `string` into a
 *                                                    {@link TValue} instance.
 * @param {Function}                outputMapFn     - Function that serializes each {@link TValue} instance into a single
 *                                                    line `string` of the ouput file.
 * @param {Function}                compareFn       - Function that compares {@link TValue} instances to determine their
 *                                                    sort order.
 *                                                    See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#parameters}
 * @param {string}                  outputDelimeter - String delimeter to separate each output string after been mapped to
 */
export async function merge<TValue>(
    inputs: Readable[] | string[],
    outputStream: Writable,
    inputMapFn: (x: string) => TValue = x => x as TValue,
    outputMapFn: (x:TValue) => string = x => String(x),
    compareFn: (a:TValue, b:TValue) => number = (a, b) => a > b? 1 : -1,
    outputDelimeter: string = '\n'): Promise<void> {
        if(!inputs || inputs.length === 0) return;
        if(inputs[0] instanceof Readable) {
            const streams = inputs as Readable[];
            await mergeSortedStreams<TValue>(streams, outputStream, inputMapFn, outputMapFn, compareFn, outputDelimeter);
        } else {
            const files = inputs as string[];
            await mergeSortedFiles<TValue>(files, outputStream, inputMapFn, outputMapFn, compareFn, outputDelimeter);
        }
}

/**
 * Merges multiple sorted files with data separated by a new line into an output Writeable stream.
 * 
 * @template TValue                         - Specifies type of a parsed instance to sort from the input file.
 * 
 * @param {string[]}        files           - List of filenames to merge
 * @param {Writable}        outputStream    - Writeable stream to output the data.
 * @param {Function}        inputMapFn      - Function that parses/deserializes an input file line `string` into a
 *                                            {@link TValue} instance.
 * @param {Function}        outputMapFn     - Function that serializes each {@link TValue} instance into a single
 *                                            line `string` of the ouput file.
 * @param {Function}        compareFn       - Function that compares {@link TValue} instances to determine their
 *                                            sort order.
 *                                            See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#parameters}
 * @param {string}          outputDelimeter - String delimeter to separate each output string after been mapped to
 */
export async function mergeSortedFiles<TValue>(
    files: string[],
    outputStream: Writable,
    inputMapFn: (x: string) => TValue,
    outputMapFn: (x:TValue) => string,
    compareFn: (a:TValue, b:TValue) => number,
    outputDelimeter: string): Promise<void> {
        if(files.length === 0) return;
        const streams: fs.ReadStream[] = []
        for(let i = 0; i < files.length;i++) {
            const f = files[i];
            const stream = fs.createReadStream(f, { highWaterMark: 100_000, flags: 'r'});
            streams.push(stream);
        }
        try {
            await mergeSortedStreams<TValue>(streams, outputStream, inputMapFn, outputMapFn, compareFn, outputDelimeter);
        } finally {
            for(let i = 0; i < streams.length; i++) {
                const stream = streams[i];
                stream.close();
            }
        }
}

/**
 * Merges multiple sorted streams with data separated by a new line into an output Writeable stream.
 * 
 * @template TValue                         - Specifies type of a parsed instance to sort from the input file.
 * 
 * @param {Readable[]}      streams         - List of streams to merge
 * @param {Writable}        outputStream    - Writeable stream to output the sorted data.
 * @param {Function}        inputMapFn      - Function that parses/deserializes an input file line `string` into a
 *                                            {@link TValue} instance.
 * @param {Function}        outputMapFn     - Function that serializes each {@link TValue} instance into a single
 *                                            line `string` of the ouput file.
 * @param {Function}        compareFn       - Function that compares {@link TValue} instances to determine their
 *                                            sort order.
 *                                            See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#parameters}
 * @param {string}          outputDelimeter - String delimeter to separate each output string after been mapped to
 */
export async function mergeSortedStreams<TValue>(
    streams: Readable[],
    outputStream: Writable,
    inputMapFn: (x: string) => TValue,
    outputMapFn: (x:TValue) => string,
    compareFn: (a:TValue, b:TValue) => number,
    outputDelimeter: string): Promise<void> {
        // Nothing to merge exit right away.
        if(streams.length === 0) return;

        let readers = new Array<MergerInfo<TValue>>();
        // Create readers
        for (let i = 0; i < streams.length; i++) {
            const readStream = streams[i];
            const reader = readline.createInterface({
                input: readStream,
                crlfDelay: Infinity
            });
            const iterator: AsyncIterableIterator<string> = reader[Symbol.asyncIterator]();
            const firstNext = await iterator.next();
            if(!(firstNext.done?? false)) { 
                readers.push({
                    data: inputMapFn(firstNext.value), 
                    done: firstNext.done ?? false,
                    iter: iterator,
                    reader: reader,
                    readStream: readStream
                });
            }
            else {
                reader.close();
            }
        }

        // Reverse sort based on the to do the merge
        let mergerInfoReverseCompareFn = (a:MergerInfo<TValue>, b: MergerInfo<TValue>) => compareFn(b.data, a.data)
        readers.sort(mergerInfoReverseCompareFn);
        
        var resultStream = outputStream;
        let writeBuffer = new Array<string>();
        let previousPromise: Promise<void> = Promise.resolve();
        let bufferStringSize = 0;
        const maxStringLength = Math.pow(2, 23) * .90; // 90% of the node js string max length
        while(readers.length > 0) {
            const mergerInfo: MergerInfo<TValue> = readers[readers.length - 1];
            readers.length--;
            let dataStr = outputMapFn(mergerInfo.data);
            writeBuffer.push(dataStr);
            bufferStringSize += dataStr.length;
            if(bufferStringSize > maxStringLength) {
                writeBuffer.push('')
                let bufferStr = writeBuffer.join(outputDelimeter);
                writeBuffer = new Array<string>();
                bufferStringSize = 0;
                await previousPromise;
                previousPromise = new Promise<void>(
                    (res) => 
                        resultStream.write(
                            bufferStr,
                            () => res())
                );
            }

            var next: any;
            do {
                next = await mergerInfo.iter.next();
            } while(next.value == undefined && !(next.done?? false))
            if (!(next.done?? false)) {
                mergerInfo.data = inputMapFn(next.value);
                mergerInfo.done = next.done ?? false;
                // Binary Search the index of equal or less than mergeInfo
                let insertIdx = binarySearch(mergerInfo, readers, mergerInfoReverseCompareFn);
                readers.splice(insertIdx, 0, mergerInfo);
            }
            else {
                mergerInfo.reader.close();
            }
        }
        // Wait for the last promise
        await previousPromise;

        // Flush the last buffer
        if(writeBuffer.length > 0) {
            await new Promise<void>((resolve) => resultStream.write(writeBuffer.join('\n'), () => resolve()));
        }
}

function binarySearch<T>(
    target: T, 
    array: T[],
    compareFn:  (a:T, b:T) => number): number {
        let start = 0;
        let end = array.length;
        while(start != end - 1) {
            const mid = Math.floor((start + end) / 2);
            const pivot = array[mid];
            if(mid == 0) {
                return mid;
            }
            const beforePivot = array[mid - 1];
            if(compareFn(pivot, target) >= 0 && compareFn(beforePivot, target) < 0)
            {
                return mid;
            }
            else if(compareFn(pivot, target) > 0) {
                end = mid;
            }
            else {
                start = mid;
            }
        }
        if(start == array.length - 1 && compareFn(array[start], target) < 0) {
            return start + 1;
        }
        return start;
}

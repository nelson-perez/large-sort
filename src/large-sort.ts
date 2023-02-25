import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import * as os from 'os';
import { Transform } from 'stream'

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
}

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
 * @template TValue                     - Specifies type of a parsed instance to sort from the input file.
 * 
 * @param {string}      inputFile       - Location of the input file to sort with data delimited by a newline.
 * @param {string}      outputFile      - Location of output file to write the sorted data delimited by a newline.
 * @param {Function}    inputMapFn      - Function that parses/deserializes an input file line `string` into a
 *                                        {@link TValue} instance.
 * @param {Function}    outputMapFn     - Function that serializes each {@link TValue} instance into a single line
 *                                        `string` of the ouput file.
 * @param {Function}    compareFn       - Function that compares {@link TValue} instances to determine their sort order.
 *                                        See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#parameters}
 * @param {string}      delimeter       - String delimeter to separate each input and output while serializing and deserializing wih the {@link inputMapFn}
 *                                        and {@link outputMapFn} functions respectively.
 * @param {number}      linesPerFile    - Maximum number of lines per temporary split file. Keep default value of 100K.
 * 
 * @return {Promise<void>}              - Promise that once resolved the output sorted file has been completely 
 *                                        created and temporary files has been cleaned up.
 */
export default async function sortFile<TValue>(
    inputFile: string,
    outputFile: string,
    inputMapFn: (x: string) => TValue,
    outputMapFn: (x:TValue) => string,
    compareFn: (a:TValue, b:TValue) => number = (a, b) => a > b? 1 : -1,
    delimeter: string = '\n',
    linesPerFile: number = 100_000): Promise<void> {
        const base = path.join(os.tmpdir(), 'large-sort');
        if(!fs.existsSync(base)) {
            fs.mkdirSync(base, {recursive: true});
        }
        const tempFolder = fs.mkdtempSync(path.join(base, "temp_"));
        const tempFiles = new Array<string>();

        TEMP_SORTS_TO_CLEAN_BEFORE_EXIT.set(tempFolder, () => deleteFiles(tempFolder));

        try {
            await split(inputFile, tempFolder, tempFiles, inputMapFn, JSON.stringify, compareFn, delimeter, linesPerFile, outputFile);
            if(tempFiles.length > 0) {
                await merge(tempFiles, outputFile, JSON.parse, outputMapFn, compareFn, delimeter);
            }
        }
        finally {
            deleteFiles(tempFolder);
            TEMP_SORTS_TO_CLEAN_BEFORE_EXIT.delete(tempFolder);
        }
}

function deleteFiles(tempFolder: string) {
    try {
        fs.rmdirSync(tempFolder);
    }
    catch {}
}


// Memory check variable
const ONE_GB = 1 * 1024 * 1024 * 1024;
const CHECK_MEMORY_LINES = 1_000;

function shouldFlushMemory(linesLoaded: number) {
    return (linesLoaded % CHECK_MEMORY_LINES === 0 && process.memoryUsage().heapUsed > ONE_GB)
}

/**
 * Function to split the file into multiple files with sorted data which are populated to the {@link outputFiles} parameter.
 *
 * @param {string}            filePath         - File path of the
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
    filePath: string,
    splitPath: string,
    outputFiles: Array<string>,
    inputMapFn: (x: string) => TValue,
    outputMapFn: (x:TValue) => string,
    compareFn: (a:TValue, b:TValue) => number,
    splitDelimeter: string,
    linesPerFile: number,
    outputFile: string): Promise<void> {
        const readStream = fs.createReadStream(filePath, {highWaterMark: (1_000 * 1024), flags: 'r'});
        let linesLoaded = 0;
        let buffer: Array<TValue> = [];
        let previousRemaingData: string = '';

        let transform = new Transform({
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
                    if (buffer.length === linesPerFile || shouldFlushMemory(linesLoaded)) {
                        flushBuffer(buffer, linesLoaded, splitPath, outputFiles, outputMapFn, compareFn);
                        buffer.length = 0;
                    }
                }
                callback()
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
                    if(outputFiles.length === 0) {
                        // HACK-HACK: If the file is small enought to fit into memory write directly to the output file.
                        flushBuffer(buffer, linesLoaded, splitPath, outputFiles, outputMapFn, compareFn, outputFile);
                        outputFiles.length = 0;
                    }
                    else {
                        flushBuffer(buffer, linesLoaded, splitPath, outputFiles, outputMapFn, compareFn);
                    }
                }
                callback();
            }
        });

        await new Promise<void>((resolve) => {
            readStream
                .pipe(transform)
                .once("finish", () => {
                    readStream.close();
                    resolve();
                })
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
    compareFn: (a:TValue, b:TValue) => number,
    outputFile?: string) {
        const filename = outputFile ?? path.join(splitPath, `large-sort_${String(linesLoaded).padStart(10, '0')}.txt`);
        let sorted = buffer.sort(compareFn);
        let mapped = sorted.map(outputMapFn);
        mapped.push(''); // Extra so it has a new line at the end.

        let toWrite = mapped.join('\n')
        
        fs.writeFileSync(filename, toWrite)
        outputFiles.push(filename);
}

type MergerInfo<T> = {
    data: T,
    done: boolean,
    iter: AsyncIterableIterator<string>,
    reader: readline.Interface,
    readStream: fs.ReadStream
}

async function merge<TValue>(
    files: Array<string>,
    resultFile: string,
    inputMapFn: (x: string) => TValue,
    outputMapFn: (x:TValue) => string,
    compareFn: (a:TValue, b:TValue) => number,
    delimeter: string): Promise<void> {
        let readers = new Array<MergerInfo<TValue>>();
        let mergedItems = 0;
        // Create readers
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const readStream = fs.createReadStream(f, { highWaterMark: 100_000, flags: 'r'});
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
                reader.close()
                readStream.close();
            }
        }

        // Reverse sort based on the to do the merge
        let mergerInfoReverseCompareFn = (a:MergerInfo<TValue>, b: MergerInfo<TValue>) => compareFn(b.data, a.data)
        readers.sort(mergerInfoReverseCompareFn);
        
        var resultStream = fs.createWriteStream(resultFile, {highWaterMark: 10_000_000, flags: 'w'});
        let writeBuffer = new Array<string>();
        let previousPromise: Promise<void> = Promise.resolve();
        let bufferStringSize = 0;
        const maxStringLength = Math.pow(2, 23) * .90; // 90% of the node js string max length
        // Wait till the result stream is open
        await new Promise<void>((r) => resultStream.once('open', () => r()));
        while(readers.length > 0) {
            const mergerInfo: MergerInfo<TValue> = readers[readers.length - 1];
            readers.length--;
            mergedItems++;
            let dataStr = outputMapFn(mergerInfo.data);
            writeBuffer.push(dataStr);
            bufferStringSize += dataStr.length;
            if(bufferStringSize > maxStringLength) {
                writeBuffer.push('')
                let bufferStr = writeBuffer.join(delimeter);
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
                mergerInfo.readStream.close();
            }
        }
        // Wait for the last promise
        await previousPromise;

        // Flush the last buffer
        if(writeBuffer.length > 0) {
            mergedItems += writeBuffer.length;
            await new Promise<void>((resolve) => resultStream.write(writeBuffer.join('\n'), () => resolve()));
        }
        resultStream.close();
}

function binarySearch<T>(
    target: T, 
    array: T[],
    compareFn:  (a:T, b:T) => number): number {
        let start = 0;
        let end = array.length;
        while(start != end - 1) {
            let mid = Math.floor((start + end) / 2);
            let pivot = array[mid];
            if(mid == 0) {
                return mid;
            }
            let beforePivot = array[mid - 1];
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

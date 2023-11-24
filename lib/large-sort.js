"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeSortedStreams = exports.mergeSortedFiles = exports.merge = exports.sortStream = exports.sortFile = void 0;
const fs = __importStar(require("fs"));
const readline = __importStar(require("readline"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const stream_1 = require("stream");
// Global variable to collect the cleanup functions for all lingering sorts if it can
const TEMP_SORTS_TO_CLEAN_BEFORE_EXIT = new Map();
function cleanTempFiles() {
    for (let cleanFn of TEMP_SORTS_TO_CLEAN_BEFORE_EXIT.values()) {
        try {
            cleanFn();
        }
        catch (_a) {
            // Ignore errors
        }
    }
    TEMP_SORTS_TO_CLEAN_BEFORE_EXIT.clear();
}
function deleteFiles(tempFolder) {
    try {
        // console.log({cleaningTempFolder: tempFolder});
        fs.rmdirSync(tempFolder);
    }
    catch (_a) { }
}
// Doing a best effort to clean any lingering split files
process.on('SIGINT', cleanTempFiles);
process.on('SIGTERM', cleanTempFiles);
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
function sortFile(inputFile, outputFile, inputMapFn = x => x, outputMapFn = x => String(x), compareFn = (a, b) => a > b ? 1 : -1, inputDelimeter = '\n', outputDelimeter = '\n', linesPerFile = 100000) {
    return __awaiter(this, void 0, void 0, function* () {
        const base = path.join(os.tmpdir(), 'large-sort');
        if (!fs.existsSync(base)) {
            fs.mkdirSync(base, { recursive: true });
        }
        const tempFolder = fs.mkdtempSync(path.join(base, "temp_"));
        const tempFiles = new Array();
        TEMP_SORTS_TO_CLEAN_BEFORE_EXIT.set(tempFolder, () => deleteFiles(tempFolder));
        try {
            const inputStream = fs.createReadStream(inputFile, { highWaterMark: Math.pow(2, 20), flags: 'r' });
            // Wait till the stream is open
            yield new Promise((r) => inputStream.once('open', r));
            yield split(inputStream, tempFolder, tempFiles, inputMapFn, JSON.stringify, compareFn, inputDelimeter, linesPerFile);
            inputStream.close();
            const inputBase = path.parse(outputFile).base;
            const tempBase = inputBase + '.temp';
            const tempFile = path.join(tempFolder, tempBase);
            const outputStream = fs.createWriteStream(tempFile, { highWaterMark: Math.pow(2, 23), encoding: "utf-8", flags: 'w' });
            // Wait till the result stream is open
            yield new Promise((r) => outputStream.once('open', r));
            yield merge(tempFiles, outputStream, JSON.parse, outputMapFn, compareFn, outputDelimeter);
            outputStream.close();
            fs.renameSync(tempFile, outputFile);
        }
        finally {
            deleteFiles(tempFolder);
            TEMP_SORTS_TO_CLEAN_BEFORE_EXIT.delete(tempFolder);
        }
    });
}
exports.sortFile = sortFile;
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
function sortStream(inputStream, outputStream, inputMapFn = x => x, outputMapFn = x => String(x), compareFn = (a, b) => a > b ? 1 : -1, inputDelimeter = '\n', outputDelimeter = '\n', linesPerFile = 100000) {
    return __awaiter(this, void 0, void 0, function* () {
        const base = path.join(os.tmpdir(), 'large-sort');
        if (!fs.existsSync(base)) {
            fs.mkdirSync(base, { recursive: true });
        }
        const tempFolder = fs.mkdtempSync(path.join(base, "temp_"));
        const tempFiles = new Array();
        TEMP_SORTS_TO_CLEAN_BEFORE_EXIT.set(tempFolder, () => deleteFiles(tempFolder));
        try {
            yield split(inputStream, tempFolder, tempFiles, inputMapFn, JSON.stringify, compareFn, inputDelimeter, linesPerFile);
            yield merge(tempFiles, outputStream, JSON.parse, outputMapFn, compareFn, outputDelimeter);
        }
        finally {
            deleteFiles(tempFolder);
            TEMP_SORTS_TO_CLEAN_BEFORE_EXIT.delete(tempFolder);
        }
    });
}
exports.sortStream = sortStream;
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
function split(inputStream, splitPath, outputFiles, inputMapFn, outputMapFn, compareFn, splitDelimeter, linesPerFile) {
    return __awaiter(this, void 0, void 0, function* () {
        let linesLoaded = 0;
        let buffer = [];
        let previousRemaingData = '';
        // Memory check variable
        const MAX_GB = 1;
        const MAX_BYTES = MAX_GB * 1024 * 1024 * 1024;
        const baseMemoryUsage = process.memoryUsage();
        const bytesToMaxBytes = MAX_BYTES - baseMemoryUsage.heapUsed;
        var current = baseMemoryUsage;
        var nextMemoryCheck = Math.min(1000, linesPerFile);
        function shouldFlushMemory(bufferSize) {
            if (bufferSize !== nextMemoryCheck)
                return false;
            current = process.memoryUsage();
            const heapDiff = current.heapUsed - baseMemoryUsage.heapUsed;
            const avgBytesPerItem = heapDiff / bufferSize;
            const maxItems = bytesToMaxBytes / avgBytesPerItem;
            nextMemoryCheck = Math.floor(maxItems * .50);
            return current.heapUsed > MAX_BYTES;
        }
        const transform = new stream_1.Transform({
            transform(chunk, encoding, callback) {
                const buff = chunk;
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
                    catch (e) {
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
                if (previousRemaingData.trim() != '') {
                    try {
                        const mapped = inputMapFn(previousRemaingData);
                        buffer.push(mapped);
                    }
                    catch (e) {
                        console.error("[large-sort] ERROR: Mapping from input file failed. error:" + String(e));
                    }
                }
                // Process the last buffer if needed
                if (buffer.length !== 0) {
                    flushBuffer(buffer, linesLoaded, splitPath, outputFiles, outputMapFn, compareFn);
                }
                callback();
            }
        });
        yield new Promise((resolve, reject) => {
            (0, stream_1.pipeline)(inputStream, transform, (err) => err ? reject(err) : resolve());
        });
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
function flushBuffer(buffer, linesLoaded, splitPath, outputFiles, outputMapFn, compareFn) {
    let sorted = buffer.sort(compareFn);
    let mapped = sorted.map(outputMapFn);
    mapped.push(''); // Extra so it has a new line at the end.
    let toWrite = mapped.join('\n');
    const filename = path.join(splitPath, `large-sort_${String(linesLoaded).padStart(10, '0')}.txt`);
    outputFiles.push(filename);
    fs.writeFileSync(filename, toWrite);
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
function merge(inputs, outputStream, inputMapFn = x => x, outputMapFn = x => String(x), compareFn = (a, b) => a > b ? 1 : -1, outputDelimeter = '\n') {
    return __awaiter(this, void 0, void 0, function* () {
        if (!inputs || inputs.length === 0)
            return;
        if (inputs[0] instanceof stream_1.Readable) {
            const streams = inputs;
            yield mergeSortedStreams(streams, outputStream, inputMapFn, outputMapFn, compareFn, outputDelimeter);
        }
        else {
            const files = inputs;
            yield mergeSortedFiles(files, outputStream, inputMapFn, outputMapFn, compareFn, outputDelimeter);
        }
    });
}
exports.merge = merge;
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
function mergeSortedFiles(files, outputStream, inputMapFn, outputMapFn, compareFn, outputDelimeter) {
    return __awaiter(this, void 0, void 0, function* () {
        if (files.length === 0)
            return;
        const streams = [];
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const stream = fs.createReadStream(f, { highWaterMark: 100000, flags: 'r' });
            streams.push(stream);
        }
        try {
            yield mergeSortedStreams(streams, outputStream, inputMapFn, outputMapFn, compareFn, outputDelimeter);
        }
        finally {
            for (let i = 0; i < streams.length; i++) {
                const stream = streams[i];
                stream.close();
            }
        }
    });
}
exports.mergeSortedFiles = mergeSortedFiles;
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
function mergeSortedStreams(streams, outputStream, inputMapFn, outputMapFn, compareFn, outputDelimeter) {
    return __awaiter(this, void 0, void 0, function* () {
        // Nothing to merge exit right away.
        if (streams.length === 0)
            return;
        let readers = new Array();
        // Create readers
        for (const readStream of streams) {
            const reader = readline.createInterface({
                input: readStream,
                crlfDelay: Infinity
            });
            const iterator = reader[Symbol.asyncIterator]();
            const firstNext = yield iterator.next();
            if (firstNext.done) {
                reader.close();
                continue;
            }
            readers.push({
                data: inputMapFn(firstNext.value),
                iter: iterator,
                reader: reader,
                readStream: readStream
            });
        }
        // Reverse sort based on the to do the merge
        let mergerInfoReverseCompareFn = (a, b) => compareFn(b.data, a.data);
        readers.sort(mergerInfoReverseCompareFn);
        var resultStream = outputStream;
        let writeBuffer = new Array();
        let previousPromise = Promise.resolve();
        let bufferStringSize = 0;
        const maxStringLength = Math.pow(2, 23) * .90; // 90% of the node js string max length
        // Using index to avoid the (array.length - 1) operations
        let lastReaderIdx = readers.length - 1;
        let beforeLastReaderIdx = readers.length - 2;
        // Looping till there is only one left
        while (readers.length !== 1) {
            const mergerInfo = readers[lastReaderIdx];
            let dataStr = outputMapFn(mergerInfo.data);
            bufferStringSize += dataStr.length;
            if (bufferStringSize > maxStringLength) {
                writeBuffer.push('');
                let bufferStr = writeBuffer.join(outputDelimeter);
                writeBuffer = [];
                bufferStringSize = dataStr.length;
                yield previousPromise;
                previousPromise = new Promise((res) => resultStream.write(bufferStr, () => res()));
            }
            writeBuffer.push(dataStr);
            let next;
            next = yield mergerInfo.iter.next();
            if (next.done) {
                // Cleaning mergeInfo once the reader is done.
                mergerInfo.reader.close();
                readers.pop();
                lastReaderIdx--;
                beforeLastReaderIdx--;
            }
            else {
                // Map the object to the output
                mergerInfo.data = inputMapFn(next.value);
                // Checking if it needs to be re-index the merge info if the previous is more than itself
                const previous = readers[beforeLastReaderIdx];
                if (mergerInfoReverseCompareFn(mergerInfo, previous) < 0) {
                    readers.pop();
                    let insertIdx = binarySearch(mergerInfo, readers, mergerInfoReverseCompareFn);
                    readers.splice(insertIdx, 0, mergerInfo);
                }
            }
        }
        // Taking care of the last remaining stream
        const lastMergeInfo = readers[0];
        let next = yield lastMergeInfo.iter.next();
        const lastMergeInfoDataOutput = outputMapFn(lastMergeInfo.data);
        bufferStringSize += lastMergeInfoDataOutput.length;
        if (bufferStringSize > maxStringLength) {
            const toWrite = writeBuffer.join(outputDelimeter);
            yield previousPromise;
            previousPromise = new Promise((resolve) => resultStream.write(toWrite, () => resolve()));
            bufferStringSize = lastMergeInfoDataOutput.length;
            writeBuffer = [];
        }
        writeBuffer.push(lastMergeInfoDataOutput);
        while (!next.done) {
            const input = inputMapFn(next.value);
            const output = outputMapFn(input);
            bufferStringSize += output.length;
            if (bufferStringSize > maxStringLength) {
                // Flush buffer
                const toWrite = writeBuffer.join(outputDelimeter);
                yield previousPromise;
                previousPromise = new Promise((resolve) => resultStream.write(toWrite, () => resolve()));
                bufferStringSize = output.length;
                writeBuffer = [];
            }
            writeBuffer.push(output);
            next = yield lastMergeInfo.iter.next();
        }
        lastMergeInfo.reader.close();
        // Flushing the last buffer
        const toWrite = writeBuffer.join(outputDelimeter);
        // Wait for the previous promise
        yield previousPromise;
        yield new Promise((resolve) => resultStream.write(toWrite, () => resolve()));
    });
}
exports.mergeSortedStreams = mergeSortedStreams;
function binarySearch(target, array, compareFn) {
    let start = 0;
    let end = array.length;
    while (start != end - 1) {
        const mid = Math.floor((start + end) / 2);
        const pivot = array[mid];
        if (compareFn(pivot, target) < 0) {
            start = mid;
        }
        else {
            const beforePivot = array[mid - 1];
            if (compareFn(beforePivot, target) < 0)
                return mid;
            end = mid;
        }
    }
    if (start === array.length - 1 && compareFn(array[start], target) < 0) {
        return start + 1;
    }
    return start;
}

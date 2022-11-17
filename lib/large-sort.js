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
exports.sortFile = void 0;
const fs = __importStar(require("fs"));
const readline = __importStar(require("readline"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// Global variable to collect the cleanup functions for all lingering sort
const sortFileToClean = new Map();
function cleanTempFiles() {
    for (let cleanFn of sortFileToClean.values()) {
        try {
            cleanFn();
        }
        catch (_a) {
            // Ignore errors
        }
    }
}
process.on('exit', cleanTempFiles);
/**
 * Function to sorts the file into another file.
 *
 * @param {string} inputFile - File path to load and sort
 * @param {string} outputFile - File path to output the sorted {@link inputFile}
 * @param {Function} inputMapFn - Function to deserialize the input from each file line.
 * @param {Function} outputMapFn - Function serialize each of the {@link TValue} to a string.
 * @param {Function} compareFn - Function used to sort the {@link TValue} for each of the files.
 * @param {number} linesPerFile - Number of lines processed before writting a split file.
 */
function sortFile(inputFile, outputFile, inputMapFn, outputMapFn, compareFn = (a, b) => a > b ? 1 : -1, linesPerFile = 100000) {
    return __awaiter(this, void 0, void 0, function* () {
        const base = path.join(os.tmpdir(), 'large-sort');
        if (!fs.existsSync(base)) {
            fs.mkdirSync(base, { recursive: true });
        }
        const tempFolder = fs.mkdtempSync(path.join(base, "temp_"));
        const tempFiles = new Array();
        sortFileToClean.set(tempFolder, () => deleteFiles(tempFolder));
        try {
            // console.debug(`[SortFile] started split of file "${inputFile}". ${new Date().toLocaleString()}`);
            // console.time(`[SortFile] finished split of file "${inputFile}" time`);
            yield split(inputFile, tempFolder, tempFiles, inputMapFn, JSON.stringify, compareFn, linesPerFile);
            // console.timeEnd(`[SortFile] finished split of file "${inputFile}" time`);
            // console.debug(`[SortFile] started merge to file "${outputFile}". ${new Date().toLocaleString()}`);
            // console.time(`[SortFile] finished merge to file "${outputFile}" time`);
            yield merge(tempFiles, outputFile, JSON.parse, outputMapFn, compareFn);
            // console.timeEnd(`[SortFile] finished merge to file "${outputFile}" time`);
        }
        finally {
            deleteFiles(tempFolder);
            sortFileToClean.delete(tempFolder);
        }
    });
}
exports.sortFile = sortFile;
function deleteFiles(tempFolder) {
    try {
        fs.rmdirSync(tempFolder);
    }
    catch (_a) { }
}
/**
 * Function to split the file into multiple files with sorted data which are populated to the {@link outputFiles} parameter.
 *
 * @param filePath File path of the
 * @param splitPath The base path on where the files will be splited to.
 * @param outputFiles List that will be populated with the output files.
 * @param inputMapFn Function to deserialize the input from each file line into a {@link TValue}.
 * @param outputMapFn Function serialize each of the {@link TValue} to a string.
 * @param compareFn Function used to sort the {@link TValue} for each of the files.
 * @param linesPerFile How many lines process for each file.
 */
function split(filePath, splitPath, outputFiles, inputMapFn, outputMapFn, compareFn, linesPerFile) {
    return __awaiter(this, void 0, void 0, function* () {
        linesPerFile = Math.floor(linesPerFile);
        const readStream = fs.createReadStream(filePath, { highWaterMark: 1000000, flags: 'r' });
        const reader = readline.createInterface({
            input: readStream,
            crlfDelay: Infinity
        });
        let linesLoaded = 0;
        let buffer = new Array();
        reader.on('line', (line) => {
            if (line.trim() != '')
                buffer.push(inputMapFn(line));
            linesLoaded++;
            // if(linesLoaded % 1000000 == 0) {
            //     console.debug(`[SortFile] ("${filePath}"): loaded ${linesLoaded.toLocaleString()} lines. ${new Date().toLocaleString()}`);
            // }
            // Flush buffer at the specified lines per file or when it is using more than 1GB of RAM
            if (linesLoaded % linesPerFile == 0 || (linesLoaded % 1000 == 0 && (process.memoryUsage().heapUsed / 1024 / 1024 / 1024) > 1)) {
                let bufferCopy = buffer;
                buffer = new Array();
                flushBuffer(bufferCopy, linesLoaded, splitPath, outputFiles, outputMapFn, compareFn);
            }
        });
        // Wait till it finishes reading the file
        yield new Promise((resolve) => reader.once('close', resolve));
        readStream.close();
        // Process the last buffer if needed
        if (buffer.length != 0) {
            flushBuffer(buffer, linesLoaded, splitPath, outputFiles, outputMapFn, compareFn);
        }
        // console.debug(`[SortFile] ("${filePath}"): loaded ${linesLoaded.toLocaleString()} lines. ${new Date().toLocaleString()}`);
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
    const filename = path.join(splitPath, `large-sort_${String(linesLoaded).padStart(10, '0')}.txt`);
    // console.time(`[SortFile.Split] Sort ${buffer.length} items time`);
    buffer.sort(compareFn);
    // console.timeEnd(`[SortFile.Split] Sort ${buffer.length} items time`);
    // console.time('[SortFile.Split]  Map items time')
    let mapped = buffer.map(outputMapFn);
    mapped.push(''); // Extra so it has a new line at the end.
    // console.timeEnd('[SortFile.Split]  Map items time')
    // console.time('[SortFile.Split]  String Join items time')
    let toWrite = mapped.join('\n');
    // console.timeEnd('[SortFile.Split]  String Join items time')
    // console.time('[SortFile.Split]  Write to disk time')
    fs.writeFileSync(filename, toWrite);
    // console.timeEnd('[SortFile.Split]  Write to disk time')
    outputFiles.push(filename);
}
function merge(files, resultFile, inputMapFn, outputMapFn, compareFn) {
    var _a, _b, _c, _d, _e;
    return __awaiter(this, void 0, void 0, function* () {
        let readers = new Array();
        let mergedItems = 0;
        // Create readers
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const readStream = fs.createReadStream(f, { highWaterMark: 100000, flags: 'r' });
            const reader = readline.createInterface({
                input: readStream,
                crlfDelay: Infinity
            });
            const iterator = reader[Symbol.asyncIterator]();
            const firstNext = yield iterator.next();
            if (!((_a = firstNext.done) !== null && _a !== void 0 ? _a : false)) {
                readers.push({
                    data: inputMapFn(firstNext.value),
                    done: (_b = firstNext.done) !== null && _b !== void 0 ? _b : false,
                    iter: iterator,
                    reader: reader,
                    readStream: readStream
                });
            }
            else {
                reader.close();
                readStream.close();
            }
        }
        // Reverse sort based on the to do the merge
        let mergerInfoReverseCompareFn = (a, b) => compareFn(b.data, a.data);
        readers.sort(mergerInfoReverseCompareFn);
        var resultStream = fs.createWriteStream(resultFile, { highWaterMark: 10000000, flags: 'w' });
        let writeBuffer = new Array();
        let previousPromise = Promise.resolve();
        let bufferStringSize = 0;
        const maxStringLength = Math.pow(2, 23) * .90; // 90% of the node js string max length
        // Wait till the result stream is open
        yield new Promise((r) => resultStream.once('open', () => r()));
        while (readers.length > 0) {
            const mergerInfo = readers[readers.length - 1];
            readers.length--;
            mergedItems++;
            let dataStr = outputMapFn(mergerInfo.data);
            writeBuffer.push(dataStr);
            bufferStringSize += dataStr.length;
            if (bufferStringSize > maxStringLength) {
                writeBuffer.push('');
                let bufferStr = writeBuffer.join('\n');
                writeBuffer = new Array();
                bufferStringSize = 0;
                yield previousPromise;
                previousPromise = new Promise((res) => resultStream.write(bufferStr, () => res()));
            }
            // if(mergedItems % 1000000 == 0) {
            //     console.debug(`[SortFile] ${mergedItems.toLocaleString()} merged items.`);
            // }
            var next;
            do {
                next = yield mergerInfo.iter.next();
            } while (next.value == undefined && !((_c = next.done) !== null && _c !== void 0 ? _c : false));
            if (!((_d = next.done) !== null && _d !== void 0 ? _d : false)) {
                mergerInfo.data = inputMapFn(next.value);
                mergerInfo.done = (_e = next.done) !== null && _e !== void 0 ? _e : false;
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
        yield previousPromise;
        // Flush the last buffer
        if (writeBuffer.length > 0) {
            mergedItems += writeBuffer.length;
            yield new Promise((resolve) => resultStream.write(writeBuffer.join('\n'), () => resolve()));
            // console.debug(`[SortFile] ${mergedItems.toLocaleString()} merged items.`);
        }
        resultStream.close();
    });
}
function binarySearch(target, array, compareFn) {
    let start = 0;
    let end = array.length;
    while (start != end - 1) {
        let mid = Math.floor((start + end) / 2);
        let pivot = array[mid];
        if (mid == 0) {
            return mid;
        }
        let beforePivot = array[mid - 1];
        if (compareFn(pivot, target) >= 0 && compareFn(beforePivot, target) < 0) {
            return mid;
        }
        else if (compareFn(pivot, target) > 0) {
            end = mid;
        }
        else {
            start = mid;
        }
    }
    if (start == array.length - 1 && compareFn(array[start], target) < 0) {
        return start + 1;
    }
    return start;
}

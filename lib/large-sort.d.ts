/// <reference types="node" />
import { Readable, Writable } from 'stream';
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
export declare function sortFile<TValue>(inputFile: string, outputFile: string, inputMapFn: (x: string) => TValue, outputMapFn: (x: TValue) => string, compareFn?: (a: TValue, b: TValue) => number, delimeter?: string, linesPerFile?: number): Promise<void>;
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
 * @param {Readable}    inputStream     - Input stream to read the data from.
 * @param {Writable}    outputStream    - Writeable stream to output the data to.
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
export declare function sortStream<TValue>(inputStream: Readable, outputStream: Writable, inputMapFn: (x: string) => TValue, outputMapFn: (x: TValue) => string, compareFn?: (a: TValue, b: TValue) => number, delimeter?: string, linesPerFile?: number): Promise<void>;

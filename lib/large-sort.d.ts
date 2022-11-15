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
export declare function sortFile<TValue>(inputFile: string, outputFile: string, inputMapFn: (x: string) => TValue, outputMapFn: (x: TValue) => string, compareFn?: (a: TValue, b: TValue) => number, linesPerFile?: number): Promise<void>;

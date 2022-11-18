# Large Sort <span style="color:#17A589">JS</span>
### [npm <span style='color:#5DADE2 '>large-sort</span>](https://www.npmjs.com/package/large-sort)
## Overview
Fast sorting library to parse and sort content from large files using [external merge sort](https://en.wikipedia.org/wiki/) for NodeJS. Currently there is one function that is called `sortFile()` to sort the file content of large files.

### `sortFile`
This function provides the necesary functionality to allows to parse the content of a line into an object or primitive that can be used for comparison and outputs the sorted content into another file. It splits the file into multple sorted temporary files with a maximun number of `linesPerFile` or if the memory reaches more than <b>1 GB</b> with a minumun of 1000 lines.
#### Function definition for `sortFile()`
```typescript
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
export async function sortFile<TValue>(
    inputFile: string,
    outputFile: string,
    inputMapFn: (x: string) => TValue,
    outputMapFn: (x:TValue) => string,
    compareFn: (a:TValue, b:TValue) => number = (a, b) => a > b? 1 : -1,
    linesPerFile: number = 100_000)
```
#### Parameters of `sortFile()`
|Name | Description    |
|         -     |   -   |
|TValue         | Type of the parsed value from the input file|
|inputFile      | File path to load and sort.|
|outputFile     | File path to output the sorted {@link inputFile}.|
|inputMapFn     | Function to deserialize the input from each file line.|
|outputMapFn    |Function serialize each of the {@link TValue} to a string.|
|compareFn      | Function used to sort the {@link TValue} for each of the files.|
|linesPerFile   | Number of lines processed for each split file. It is recommended to keep the default value to mantain performance.|

## Install
Install to your NodeJS project using [npm](https://npmjs.org).
```bash
npm install large-sort
```
## Usage
```typescript

 // Function to tansform a line from input file into an object to use for comparison
 let inputMapFunction = input: string => Number(input);

 // Function to tansform a loaded object into string as a line for the output file
 let outputMapFuncton = output: number => output.toString();

 // Comparison function used to sort the objects similar to the compare function for {@link Array.sort}`
 let comparisonFunction = (a: number, b: number) => a > b? 1 : -1;

 // Sorts the lines of the file "input_file.txt" as numbers and outputs it to the "out_sorted_file.txt" file
 await sortFile<number>(
    'input_file.txt',
    'output_sorted_file.txt',
    inputMapFunction,
    outputMapFuncton,
    compareFunction);

 ```

 <style>
    table {
    border-collapse: collapse;
    width: 100%;
    }
    header {
        text-align: right;
        font-family: arial, sans-serif;
        font-style: bold;
        background-color: black;
    }
    table.td, table.th {
    border: 1px solid #dddddd;
    text-align: left;
    padding: 8px;
    }

    tr:nth-child(even) {
    background-color: #f5f5fa;
}
</style>
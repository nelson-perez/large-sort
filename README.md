[![Node.js CI](https://github.com/nelson-perez/large-sort/actions/workflows/node.js.yml/badge.svg)](https://github.com/nelson-perez/large-sort/actions/workflows/node.js.yml)

![Large Sort JS](img/large_sort_js.png)

> [![npm large-sort](img/npm_large-sort.png)](https://www.npmjs.com/package/large-sort)

## Overview

Fast sorting library that parses, sorts and serializes the content of large files using [external merge sort](https://en.wikipedia.org/wiki/External_sorting) for NodeJS. Currently there is one function that is called `sortFile()` to sort the file content of large files.
###### Additional planned features:
- Enable ***custom delimeters*** for the data via `string` or `regex`.
- Load the input from a `ReadStream` and output the sorted data into a `WriteStream` instead of file to file.
- _[_ ${\color{green}exploring}$ _]_ - Create API to build the sort scenario based on a property/field name or an `extract property function` instead of a comparer function.
  - This is an area of exploration to see if there could be performance advantages utilizing `number` and `string` specific sorting algorithms instead of relying on the comparer.

## Install

Install to your NodeJS project using [npm](https://npmjs.org).
```bash
npm install large-sort
```

## API
### `sortFile`

This function provides the necesary functionality that allows to parse line by line of the input file from a `string` into an object or primitive that can be **compared**, **sorted** and **serialized** into an output file. It sorts the data using an [external merge sort](https://en.wikipedia.org/wiki/External_sorting) algorithm which splits the file into multiple sorted temporary files with a maximun number of `linesPerFile` or if the memory reaches more than <b>1 GB</b> with a minumun of 1000 lines and then merges each of the splited files into a single output file.


#### Function definition of `sortFile()`

```typescript
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
 * @param {number}      linesPerFile    - Maximum number of lines per temporary split file. Keep default value of 100K.
 * 
 * @return {Promise<void>}              - Promise that once resolved the output sorted file has been completely 
 *                                        created and temporary files has been cleaned up.
 */
export async function sortFile<TValue>(
    inputFile: string,
    outputFile: string,
    inputMapFn: (x: string) => TValue,
    outputMapFn: (x:TValue) => string,
    compareFn: (a:TValue, b:TValue) => number = (a, b) => a > b? 1 : -1,
    linesPerFile: number = 100_000): Promise<void> 
```

#### Parameters of `sortFile()`

|Name               | Description|
|         -         |   -   |
|***TValue***       | Type of the parsed value from the input file|
|__inputFile__      | File path of the file that contains data delimited by a _newline_ `"\n"` to be sorted.|
|__outputFile__     | File path of the output sorted data delimited by a _newline_ `"\n"`.|
|__inputMapFn__     | Function that maps/parses a `string` from a single line of the input file into a **TValue** type.|
|__outputMapFn__    | Function maps/serializes each **TValue** into a single line `string` for the output file.|
|__compareFn__      | Comparer function of **TValue** types to define the sorting order. _example_: `(a, b) => a > b? 1 : -1`|
|__linesPerFile__   | Max number of lines processed for each file split. _`It's recommended to keep the default value for performance.`_|


## Usage examples
Here are examples showing the scenarios where this would be useful.

#### Sorting numbers
Here is an example that explain each of the parameters and how to use it to sort a file with `Numbers` and outputs the numbers as strings.

```typescript

 // Function that tansform a line from input file into an object to use for comparison
 let inputMapFunction = input: string => Number(input);

 // Function that tansform a loaded object into string as a line for the output file
 let outputMapFuncton = output: number => output.toString();

 // Function that compares two numbers to define their sort order.
 let compareFunction = (a: number, b: number) => a > b? 1 : -1;

 // Sorts the lines of the file "input_file.txt" as numbers and outputs it to the "out_sorted_file.txt" file
 await sortFile<number>(
    'input_file.txt',
    'output_sorted_file.txt',
    inputMapFunction,
    outputMapFuncton,
    compareFunction);

 ```


 #### Sorting CSV file
 This example shows how to sort a csv file based on the value of the second column by parsing the csv into an array, sorting the array based on the second column and writting the array back into the csv format.

 ```typescript

 // Function to extract the input csv data into an array of two columns.
function parseCsv(inputLine: string): string[] {
    let array = line.split(',');
    return array;


// Function to output the parsed csv into the output file.
function outputCsv(array: string[]): string {
    let outputLine = array.join(',');
    return outputLine;
}


// Sorts the file base on the second column of the csv file
await sortFile<string[]>(
    'input.csv',                    // inputFile    - input csv file
    'sorted_output.csv',            // outputFile   - sorted output csv file
    parseCsv,                       // inputMapFn   - (line) => line.split(','),  
    outputCsv,                      // outputMapFn  - (array) => array.join(',')
    (a, b) => a[1] > b[1]? 1 : -1); // compareFn    - comparing the second column for sorting.

 ```

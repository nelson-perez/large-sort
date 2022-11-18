
![Large Sort JS](img/large_sort_js.png)

> [![npm large-sort](img/npm_large-sort.png)](https://www.npmjs.com/package/large-sort)

## Overview

Fast sorting library that parses, sorts and serializes the content of large files using [external merge sort](https://en.wikipedia.org/wiki/) for NodeJS. Currently there is one function that is called `sortFile()` to sort the file content of large files.
###### Additional planned features:
- Enable ***custom delimeters*** for the data via `string` or `regex`.
- Load the input from a `ReadStream` and output the sorted data into a `WriteStream` instead of file to file.
- [ ${\color{green}Exploring}$ ] - Create API to build the sort scenario based on a property/field name or an `extract property function` instead of a comparer function.
  - This is an area of exploration to see if there could be performance advantages utilizing `number` and `string` specific sorting algorithms instead of relying on the comparer.

## Install

Install to your NodeJS project using [npm](https://npmjs.org).
```bash
npm install large-sort
```

## API
### `sortFile`

This function provides the necesary functionality that allows to parse line by line of the input file from a `string` into an object or primitive that can be **compared**, **sorted** and **serialized** into an output file. It sorts the data using an [external merge sort](https://en.wikipedia.org/wiki/) algorithm which splits the file into multiple sorted temporary files with a maximun number of `linesPerFile` or if the memory reaches more than <b>1 GB</b> with a minumun of 1000 lines and then merges each of the splited files into a single output file.


#### Function definition of `sortFile()`

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

|Name               | Description|
|         -         |   -   |
|***TValue***       | Type of the parsed value from the input file|
|__inputFile__      | File path of the file that contains data delimited by a _newline_ `"\n"` to be sorted.|
|__outputFile__     | File path of the output sorted data delimited by a _newline_ `"\n"`.|
|__inputMapFn__     | Function that maps/parses a `string` from a single line of the input file into a **TValue** type.|
|__outputMapFn__    | Function maps/serializes each **TValue** into a single line `string` for the output file.|
|__compareFn__      | Comparer function of **TValue** types to determine the sorting order. _example_: `(a, b) => a > b? 1 : -1`|
|__linesPerFile__   | Max number of lines processed for each file split. _`It's recommended to keep the default value for performance.`_|


## Usage examples
Here are examples showing the scenarios where this would be useful.

#### Sorting numbers
Here is an example that explain each of the parameters and how to use it to sort a file with `Numbers` and outputs the numbers as strings.

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

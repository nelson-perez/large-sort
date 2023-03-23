![Large Sort JS](img/large_sort_js.png)

[![Node.js CI](https://github.com/nelson-perez/large-sort/actions/workflows/node.js.yml/badge.svg)](https://github.com/nelson-perez/large-sort/actions/workflows/node.js.yml)
[![Total Downloads](https://img.shields.io/npm/dt/large-sort.svg)](https://www.npmjs.com/package/large-sort)
[![Start](https://img.shields.io/github/stars/nelson-perez/large-sort?style=flat-square)](https://github.com/nelson-perez/large-sort/stargazers)
[![MIT Licence](https://badges.frapsoft.com/os/mit/mit.svg?v=103)](https://opensource.org/licenses/mit-license.php)
[![Open Source Love](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://opensource.org/)

<!--- [![large-sort](/advisor/npm-package/large-sort/badge.svg)](/advisor/npm-package/large-sort) -->

[![NPM Package](https://nodei.co/npm/large-sort.png)](https://www.npmjs.com/package/large-sort)


<!-- [![npm large-sort](img/npm_large-sort.png)](https://www.npmjs.com/package/large-sort) -->

# Overview
Fast sorting library that parses, sorts and serializes the content of large files using [external merge sort](https://en.wikipedia.org/wiki/External_sorting) for NodeJS.Currently there are two functions `sortFile()` to sort the file content of large files and `sortStream()` to generically sort `Stream`.

### Additional planned features:
- [DONE] Enable ***custom delimeters*** for the data via `string` or `regex`.
- [DONE] Load the input from a `ReadStream` and output the sorted data into a `WriteStream` instead of file to file.
- *[**exploring**]* - Create API to build the sort scenario based on a property/field name or an `extract property function` instead of a comparer function.
  - This is an area of exploration to see if there could be performance advantages utilizing `number` and `string` specific sorting algorithms instead of relying on the comparer.
- *[**exploring**]* - I've been experimenting a bit using `thread_workers` to help sort during the split process and although I did saw great performance, it comes with the disadvange passing the comparer as serializable JSON which is not possible to pass a function so it will require some refactoring like I mentioned above where instead of providing the compareFn you need provide a property/field you would like to sort with. I think I'll borrow some inspiration from [fast-sort](https://www.npmjs.com/package/fast-sort) which uses that similar builder approach to build the sorter before doing the actual sort but without the lambda capability when using `thread_workers`. I'll probably switch the logic depending if the caller provides a property or provides a function to either compare or resolve a property.


# Installation
Install to your NodeJS project using [npm](https://npmjs.org/large-sort).
```bash
npm install large-sort --save
```

# API
## `sortFile()`
This method provides the necesary functionality that allows to parse line by line the input file deserializing from a `string` into an object or primitive that can be **compared**, **sorted** and **serialized** back into an output file. It sorts the data using an [external merge sort](https://en.wikipedia.org/wiki/External_sorting) algorithm which splits the file into multiple sorted temporary *k-files* and then merges each of the splited *k-files* into a single output file.

The size of the splitted files is controlled by the maximun number of lines per file (`linesPerFile`) parameter or if the memory reaches more than ***1GB*** with a minumum of 1,000 lines whichever happens first.


### Parameters of `sortFile()`
|Name               | Description|
|         -         |   -   |
|***TValue***       | Type of the parsed value from the input file|
|__inputFile__      | File path of the file that contains data delimited by a _newline_ `"\n"` to be sorted.|
|__outputFile__     | File path of the output sorted data delimited by a _newline_ `"\n"`.|
|__inputMapFn__     | Function that maps/parses a `string` from a single line of the input file into a **TValue** type.|
|__outputMapFn__    | Function maps/serializes each **TValue** into a single line `string` for the output file.|
|__compareFn__      | Comparer function of **TValue** types to define the sorting order. _example_: `(a, b) => a > b? 1 : -1`|
|__linesPerFile__   | Max number of lines processed for each file split. _`It's recommended to keep the default value for performance.`_|


### Function definition of `sortFile()`
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
 * It is recommended to not specify the {@link linesPerFile} parameter to keep the default value of 100,000.
 * The `sortFile()` function has been tested/benchmarked for the best sorting/io performance and 100,000 gave the
 * best results during bechmarking tests.
 * 
 * The {@link linesPerFile} can be specified only for special scenarios when you need to overcome the `too many files`
 * error when restricted of other options or to tune performance for larger `TValue` instances or slow temp file IO.
 * 
 * When sorting tremendously large files the following error may occur:
 *  ---------------------------------------
 * | `Error: EMFILE, too many open files`  |
 *  ---------------------------------------
 * This error occurs when the input has been splited into more streams/files than the user can concurrently open
 * during the k-file merge process which opens all those splitted files at the same time.
 * 
 * To overcome this error you'll need to increase the maximum number of concurrent open stream/files limit by
 * either using the `$ ulimit -n <max concurrent open files/streams (default: 1024)>` command or updating the
 * `/etc/security/limit.conf` file.
 * 
 * If the steps above are not feasible then you could overcome it by specifying a larger value to the 
 * {@link linesPerFile} parameter above the default 100,000 which could result less files to merge.
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

### Usage examples
Here are examples showing the scenarios where this would be useful.

#### Sorting numbers
Here is an example that explain each of the parameters and how to use it to sort a file with `Numbers` and outputs the numbers as strings.

```typescript
// Function that tansforms a line from input file into a number to use for comparison.
const inputMapFunction = (input: string) => Number(input);

// Function that tansform a parsed number back into string as a line for the output file.
const outputMapFuncton = (output: number) => output.toString();

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


#### Sort CSV file by the second column
 This example shows how to sort a csv file based on the value of the second column by parsing the csv into an array, sorting the array based on the second column and writting the array back into the csv format.

 ```typescript

 // Function that transforms the input csv row into an array with the values.
function parseCsv(inputLine: string): string[] {
    let array = inputLine.split(',');
    return array;
}

// Function to transforms the csv value array into a csv row `string` line for output.
function outputCsv(array: string[]): string {
    let outputLine = array.join(',');
    return outputLine;
}

// Sorts the file base on the second column of the csv file
await sortFile<string[]>(
    'input.csv',                    // inputFile    - input csv file
    'sorted_output.csv',            // outputFile   - sorted output csv file
    parseCsv,                       // inputMapFn   - maps the input csv row into an array of column values
    outputCsv,                      // outputMapFn  - maps the array of values into a csv row to output
    (a, b) => a[1] > b[1]? 1 : -1); // compareFn    - compares the second column to sort in ascending order

 ```

#### Sort CSV input and outputs lines of JSON
 This example shows how to sort a csv file based on the value of the second column and output parsed JSON. Does this parsing the csv into an object with fiels `col1` and `col2`, sorts these objects by the `col2` field and writes the object to a output lines as JSON.

 ```typescript

 // Function that transforms the input csv row into an object.
function parseCsv(inputLine: string): {col1: string, col2: string} {
    let array = inputLine.split(',');
    return {
        col1: array[0],
        col2: array[1]
    };
}

// Function that transform the parsed object into a JSON string
function outputJSON(obj: {col1: string, col2: string}): string {
    let ouputLine = JSON.stringify(obj);
    return outputLine;
}

// Sorts the file base on the second column of the csv file
await sortFile<{col1: string, col2: string}>(
    'input.csv',                        // inputFile    - input csv file
    'sorted_output.txt',                // outputFile   - sorted output csv file
    parseCsv,                           // inputMapFn   - maps the input line `string` to an object
    outputJSON,                         // outputMapFn  - maps the object into a json string [JSON.stringify]
    (a, b) => a.col2 < b.col2? 1 : -1); // compareFn    - compare the field col2 to sort in descending order

 ```

 #### Sort CSV by the combination of two columns
 This example shows how to sort a csv file based on the value columns 1 and column2 by parsing the csv into an object containing a field `sortBy` and the array of values, sorts the objects by the `sortBy` field and writes the array of values into the csv format.

 *Note:*
 The computation of the data to sort by is done ahead of time once during the input parsing in the `parseCsv()` call instead of on each comparison `compareFn` call for performance reasons.

 ```typescript

 // Function that transforms the input csv row into an object with a `sortBy` field 
function parseCsv(inputLine: string): {sortBy: string, array: string[]} {
    let array = inputLine.split(',');
    // Generating the sort by value ahead of time once instead of on comparison `compareFn` call.
    return {
        sortBy: array[0] + array[1] 
        array: array
    };
}

// Function that transform the object into a json string
function outputCSV(obj: {sortBy: string, array: string[]}): string {
    let ouputLine = obj.array.join(',');
    return outputLine;
}

// Sorts the file based on the combination of columns 1 and 2 from the csv file
await sortFile<{sortBy: string, array: string[]}>(
    'input.csv',                            // inputFile    - input csv file
    'sorted_output.txt',                    // outputFile   - sorted output csv file
    parseCsv,                               // inputMapFn   - maps the input line `string` to an object
    outputJSON,                             // outputMapFn  - maps the object into a csv row line to ouput
    (a, b) => a.sortBy > b.sortBy? 1 : -1); // compareFn    - compares using `sortBy` field to sort in ascending order

 ```


## `sortStream()`
This method provides the necesary functionality that allows read and parse data from a stream given the provided delimeter. It deserializes from the input `string` into an object or primitive that can be **compared**, **sorted** and **serialized** back into to write into the output stream. It sorts the data using an [external merge sort](https://en.wikipedia.org/wiki/External_sorting) algorithm which splits the file into multiple sorted temporary *k-files* and then merges each of the splited *k-files* into the output stream.

The size of the splitted files is controlled by the maximun number of lines per file (`linesPerFile`) parameter or if the memory reaches more than ***1GB*** with a minumum of 1,000 lines whichever happens first.

> Note: It is recommended to use the `sortFile()` method when sorting files as it is quite efficient and tunned to perform at it's best.

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


#### Function definition of `sortFile()`
```typescript
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
 * 
 * @return {Promise<void>}              - Promise that once resolved the output sorted file has been completely 
 *                                        created and temporary files has been cleaned up.
 */
export async function sortStream<TValue>(
    inputStream: Readable,
    outputStream: Writable,
    inputMapFn: (x: string) => TValue,
    outputMapFn: (x:TValue) => string,
    compareFn: (a:TValue, b:TValue) => number = (a, b) => a > b? 1 : -1,
    delimeter: string = '\n',
    linesPerFile: number = 100_000): Promise<void>
```

## Usage
Similar to the `sortFile()` mtehod `sortStream()` offers all the same capabilities remain the same with the nuance of you'll be using Streams instead of files. But keep in mind if you want to do file to file sorting it's best to use the `sortFile()` function instead of creating the streams yourself.

Bellow is am example showing how to use it.

#### Sorting numbers file and output to terminal
Here is an example that explain each of the parameters and how to use it to sort a file with `Numbers` and outputs the numbers as strings to the terminal.

```typescript
// Function that tansforms a line from input file into a number to use for comparison.
const inputMapFunction = (input: string) => Number(input);

// Function that tansform a parsed number back into string as a line for the output file.
const outputMapFuncton = (output: number) => output.toString();

 // Function that compares two numbers to define their sort order.
 const compareFunction = (a: number, b: number) => a > b? 1 : -1;

// ReadStream or Readable from file
const inputStream = fs.createReadStream('input_file.txt', {flags: 'r'});

// Output stream to the terminal
const outputStream = process.stdout;

// Wait till the input stream opens
await new Promise<void>((resolve) => inputStream.once('open', resolve))

// Sort the lines of the inputStream (file "input_file.txt") as numbers and outputs the results to the outputStream (terminal sdtout)
await sortStream<number>(
        inputStream,
        outputStream,
        inputMapFunction,
        outputMapFuncton,
        compareFunction);
 ```

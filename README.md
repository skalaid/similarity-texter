# similarity texter

## Usage

This web application measures, and reports lexical similarities between two input files and/or texts.

## Folder structure

- **dist**         : This folder contains the latest compiled version.
- **src**          : This folder contains the files to be compiled. More specifically:
  - **src/js**     : This folder contains the JS source code.
  - **src/less**   : This folder contains the LESS files.
  - **src/public** : This folder contains the static assets of the web app. The contents of this folder will be copied to the **dist** folder during compilation.

## External JS libraries/frameworks

* [Bootstrap](http://getbootstrap.com/) (v3.3.6)
* [Bootstrap Filestyle](http://markusslima.github.io/bootstrap-filestyle/) (v1.2.1)
* [Font Awesome](http://fortawesome.github.io/Font-Awesome/) (v4.5.0)
* [jQuery](http://jquery.com/) (v2.2.0)
* [JSZip](http://stuk.github.io/jszip/) (v2.5.0)
* [XRegExp](http://xregexp.com/) (v3.0.0)

## Compile 

If you need to make changes to the JS source code or to the LESS files, you need to recompile the web app from scratch.

### Compilation instructions

- Install [Node.js](http://nodejs.org/en/).
- Open the console, and go to the directory ``local_path/similarity-texter/``.
- To install the dependencies required for compilation, execute the following command: ``npm install``.
  Once the dependencies are installed, you can proceed to the compilation of the web app.
- To recompile the web app just once, type the following command: ``npm run build``.
- For recompiling the web app after each change you make, type instead: ``npm run watch``.

During compilation, the contents of the folder **dist** are replaced with the new compiled ones.

## License

[![CC BY-NC-SA][by-nc-sa-image]][by-nc-sa]

This work is licensed under a
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License][by-nc-sa].

[by-nc-sa]: https://creativecommons.org/licenses/by-nc-sa/4.0/
[by-nc-sa-image]: https://i.creativecommons.org/l/by-nc-sa/4.0/88x31.png


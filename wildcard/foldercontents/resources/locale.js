/*
 * jQuery File Upload Plugin Localization Example 6.5.1
 * https://github.com/blueimp/jQuery-File-Upload
 *
 * Copyright 2012, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * http://www.opensource.org/licenses/MIT
 */
/*global $, window, jarn */

// Get the current language
var lang = $('html').attr('lang');
var mf = function(m){
    return m;
}

try {
    // get the translation tool catalog for the given language and domain
    jarn.i18n.loadCatalog('wildcard.foldercontents', lang);

    // let's create a message factory
    mf = jarn.i18n.MessageFactory('wildcard.foldercontents', lang);
} catch (e) {
    console.log('failed to load jarn.i18n');
    // do not bork...
}
window.locale = {
    "messagefactory": mf,
    "fileupload": {
        "errors": {
            "maxFileSize": "File is too big",
            "minFileSize": "File is too small",
            "acceptFileTypes": "Filetype not allowed",
            "maxNumberOfFiles": "Max number of files exceeded",
            "uploadedBytes": "Uploaded bytes exceed file size",
            "emptyResult": "Empty file upload result"
        },
        "error": "Error",
        "start": "Start",
        "cancel": "Cancel",
        "destroy": "Delete"
    }
};

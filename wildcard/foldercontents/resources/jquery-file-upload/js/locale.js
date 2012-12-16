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

/*global window */

// Get the current language
var lang = jq('html').attr('lang');
 
// get the translation tool catalog for the given language and domain
jarn.i18n.loadCatalog('wildcard.foldercontents', lang);

// let's create a message factory
    mf = jarn.i18n.MessageFactory('wildcard.foldercontents', lang);
if (! jarn.i18n.catalogs['wildcard.foldercontents'][lang]) {
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
}
else {
    window.locale = {
        "messagefactory": mf,
        "fileupload": {
            "errors": {
                "maxFileSize": mf("File is too big"),
                "minFileSize": mf("File is too small"),
                "acceptFileTypes": mf("Filetype not allowed"),
                "maxNumberOfFiles": mf("Max number of files exceeded"),
                "uploadedBytes": mf("Uploaded bytes exceed file size"),
                "emptyResult": mf("Empty file upload result")
            },
            "error": mf("Error"),
            "start": mf("Start"),
            "cancel": mf("Cancel"),
            "destroy": mf("Delete")
        }
    };
}

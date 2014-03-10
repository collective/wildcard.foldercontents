Introduction
============

Since version 2, this package aims to be a backport of the Plone 5 folder
contents implementation.


Features
--------

- better drag and drop implementation
- Shortcuts to move items to the top or bottom of folder
- Multi-file upload
- shift-click selection
- drag drop files from desktop to upload
- change workflow
- change tags
- properties
- rename
- add menu


Installation
------------

I'm aiming to support Plone versions 4.1 through 4.3. Each version requires
that you pin a few newer versions of a few plone packages.


Plone 4.3
~~~~~~~~~

version pins::

    [versions]
    plone.app.querystring = 1.1.0


Plone 4.2
~~~~~~~~~

version pins::

    [versions]
    plone.app.querystring = 1.1.0
    plone.app.vocabularies = 2.1.12


Plone 4.1
~~~~~~~~~

version pins::

    [versions]
    plone.app.vocabularies = 2.1.12
    plone.app.querystring = 1.1.0
    plone.app.registry = 1.1



Tus support
-----------

add egg::

    eggs = 
        ...
        wildcard.foldercontents
        tus
        ...


Or::

    eggs =
        ...
        wildcard.foldercontents[tus]
        ...


Then, settings for tus::

    environment-vars =
        TUS_ENABLED true
        TUS_TMP_FILE_DIR ${buildout:directory}/var/tmp


make tus directory::

    mkdir var/tmp



from .interfaces import IATCTFileFactory
from .interfaces import IDXFileFactory
from Products.Archetypes.event import ObjectInitializedEvent
from Products.CMFCore.interfaces._content import IFolderish
from Products.CMFCore.utils import getToolByName
from Products.CMFPlone import utils as ploneutils
from Products.CMFPlone.utils import safe_unicode
from thread import allocate_lock
from zope.component import adapts
from zope.container.interfaces import INameChooser
from zope.event import notify
from zope.interface import implements
from zope.lifecycleevent import ObjectModifiedEvent

import transaction


try:
    from plone.namedfile.file import NamedBlobImage
    from plone.namedfile.file import NamedBlobFile
except ImportError:
    # only for dext
    pass

upload_lock = allocate_lock()


class ATCTFileFactory(object):
    """Ripped out of collective.uploadify
    """
    implements(IATCTFileFactory)
    adapts(IFolderish)

    def __init__(self, context):
        self.context = context

    def __call__(self, name, content_type, data):
        ctr = getToolByName(self.context, 'content_type_registry')
        type_ = ctr.findTypeName(name.lower(), '', '') or 'File'

        # otherwise I get ZPublisher.Conflict ConflictErrors
        # when uploading multiple files
        upload_lock.acquire()

        name = safe_unicode(name)
        chooser = INameChooser(self.context)
        newid = chooser.chooseName(name, self.context.aq_parent)
        try:
            transaction.begin()
            obj = ploneutils._createObjectByType(type_,
                                                 self.context, newid)
            mutator = obj.getPrimaryField().getMutator(obj)
            mutator(data, content_type=content_type, filename=name)
            obj.setTitle(name)
            if hasattr(obj, 'setFilename'):
                # if chunk uploaded, needs override
                obj.setFilename(name)
            obj.reindexObject()

            notify(ObjectInitializedEvent(obj))
            notify(ObjectModifiedEvent(obj))

            transaction.commit()
        finally:
            upload_lock.release()
        return obj


class DXFileFactory(object):
    """Ripped out from above """
    implements(IDXFileFactory)
    adapts(IFolderish)

    def __init__(self, context):
        self.context = context

    def __call__(self, name, content_type, data):
        # contextual import to prevent ImportError
        from plone.dexterity.utils import createContentInContainer

        ctr = getToolByName(self.context, 'content_type_registry')
        type_ = ctr.findTypeName(name.lower(), '', '') or 'File'

        # otherwise I get ZPublisher.Conflict ConflictErrors
        # when uploading multiple files
        upload_lock.acquire()

        name = safe_unicode(name)
        chooser = INameChooser(self.context)
        newid = chooser.chooseName(name, self.context.aq_parent)
        try:
            transaction.begin()

            # Try to determine which kind of NamedBlob we need
            # This will suffice for standard p.a.contenttypes File/Image
            # and any other custom type that would have 'File' or 'Image' in
            # its type name
            filename = getattr(data, 'filename', '')
            if not filename:
                request_file = self.context.REQUEST.form.get('files[]')
                if request_file:
                    filename = request_file.filename
            if 'File' in type_:
                file = NamedBlobFile(data=data.read(),
                                     filename=safe_unicode(filename),
                                     contentType=content_type)
                obj = createContentInContainer(self.context,
                                               type_,
                                               id=newid,
                                               file=file)
            elif 'Image' in type_:
                image = NamedBlobImage(data=data.read(),
                                       filename=safe_unicode(filename),
                                       contentType=content_type)
                obj = createContentInContainer(self.context,
                                               type_,
                                               id=newid,
                                               image=image)

            obj.title = name
            obj.reindexObject()
            transaction.commit()

        finally:
            upload_lock.release()

        return obj

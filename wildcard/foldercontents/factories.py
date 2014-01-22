import transaction
from thread import allocate_lock

from zope.component import getUtility
from zope.component import adapts
from zope.container.interfaces import INameChooser
from zope.lifecycleevent import ObjectModifiedEvent
from zope.event import notify
from zope.interface import implements

from Products.Archetypes.event import ObjectInitializedEvent
from Products.CMFCore.utils import getToolByName
from Products.CMFCore.interfaces._content import IFolderish
from Products.CMFPlone import utils as ploneutils


try:
    from plone.namedfile.file import NamedBlobImage
    from plone.namedfile.file import NamedBlobFile
except ImportError:  # pragma: no cover
    # only for dext
    pass  # pragma: no cover
from plone.i18n.normalizer.interfaces import IFileNameNormalizer
from wildcard.foldercontents.interfaces import IATCTFileFactory, IDXFileFactory

upload_lock = allocate_lock()

import pkg_resources

try:
    pkg_resources.get_distribution('plone.dexterity')
except pkg_resources.DistributionNotFound:
    HAS_DEXTERITY = False
else:
    from plone.dexterity.utils import createContentInContainer
    HAS_DEXTERITY = True


class ATCTFileFactory(object):
    """
    ripped out of collective.uploadify
    """
    implements(IATCTFileFactory)
    adapts(IFolderish)

    def __init__(self, context):
        self.context = context

    def __call__(self, name, content_type, data):
        ctr = getToolByName(self.context, 'content_type_registry')
        type_ = ctr.findTypeName(name.lower(), '', '') or 'File'

        # XXX: quick fix for german umlauts
        name = name.decode("utf8")

        normalizer = getUtility(IFileNameNormalizer)
        chooser = INameChooser(self.context)

        # otherwise I get ZPublisher.Conflict ConflictErrors
        # when uploading multiple files
        upload_lock.acquire()

        # this should fix #8
        newid = chooser.chooseName(normalizer.normalize(name),
                                   self.context.aq_parent)
        try:
            transaction.begin()
            obj = ploneutils._createObjectByType(type_,
                                                 self.context, newid)
            mutator = obj.getPrimaryField().getMutator(obj)
            mutator(data, content_type=content_type)
            obj.setTitle(name)
            obj.reindexObject()

            notify(ObjectInitializedEvent(obj))
            notify(ObjectModifiedEvent(obj))

            transaction.commit()
        finally:
            upload_lock.release()
        return obj


class DXFileFactory(object):
    """ Ripped out from above """
    implements(IDXFileFactory)
    adapts(IFolderish)

    def __init__(self, context):
        self.context = context

    def __call__(self, name, content_type, data):
        ctr = getToolByName(self.context, 'content_type_registry')
        type_ = ctr.findTypeName(name.lower(), '', '') or 'File'

        name = name.decode("utf8")

        chooser = INameChooser(self.context)

        # otherwise I get ZPublisher.Conflict ConflictErrors
        # when uploading multiple files
        upload_lock.acquire()

        newid = chooser.chooseName(name, self.context.aq_parent)
        try:
            transaction.begin()

            # Try to determine which kind of NamedBlob we need
            # This will suffice for standard p.a.contenttypes File/Image
            # and any other custom type that would have 'File' or 'Image' in
            # its type name
            filename = ploneutils.safe_unicode(name)
            if 'Image' in type_:
                image = NamedBlobImage(data=data,
                                       filename=filename,
                                       contentType=content_type)
                obj = createContentInContainer(
                    self.context, type_, id=newid, image=image)
            else:
                file = NamedBlobFile(data=data,
                                     filename=filename,
                                     contentType=content_type)
                obj = createContentInContainer(
                    self.context, type_, id=newid, file=file)

            obj.title = name
            obj.reindexObject()
            transaction.commit()

        finally:
            upload_lock.release()

        return obj

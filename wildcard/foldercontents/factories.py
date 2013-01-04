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

from plone.i18n.normalizer.interfaces import IFileNameNormalizer

from wildcard.foldercontents.interfaces import IATCTFileFactory

upload_lock = allocate_lock()


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

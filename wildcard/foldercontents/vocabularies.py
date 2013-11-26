# XXX This is all ripped out of latest plone.app.vocabularies

from zope.interface import implements
from zope.schema.interfaces import IVocabularyFactory
from zope.schema.vocabulary import SimpleTerm
from zope.site.hooks import getSite
from zope.interface import directlyProvides

from Products.CMFCore.utils import getToolByName

from plone.app.querystring import queryparser
from plone.uuid.interfaces import IUUID
from wildcard.foldercontents.interfaces import ISlicableVocabulary


class SlicableVocabulary(object):
    """
    A tokenized voacabulary in which the results can be sliced.
    This class does not implement a complete vocabulary. Instead you use
    this class as a mixin to your vocabulary class.
    This mixin class expects to be used with something resembling
    a SimpleVocabulary. It accesses internal members like _terms
    """
    implements(ISlicableVocabulary)

    def __init__(self, terms=[], *interfaces):
        self._terms = terms
        if interfaces:
            directlyProvides(self, *interfaces)

    def __getitem__(self, start, stop=None):
        if isinstance(start, slice):
            slice_inst = start
            start = slice_inst.start
            stop = slice_inst.stop
        elif not stop:
            return self._terms[start]

        # sliced up
        return self._terms[start:stop]

    def __len__(self):
        return len(self._terms)


class CatalogVocabulary(SlicableVocabulary):

    @classmethod
    def fromItems(cls, brains, context, *interfaces):
        return cls(brains)
    fromValues = fromItems

    @classmethod
    def createTerm(cls, brain, context):
        return SimpleTerm(brain, brain.UID, brain.UID)

    def __init__(self, brains, *interfaces):
        self._brains = brains

    def __iter__(self):
        return iter(self._terms)

    def __contains__(self, value):
        if isinstance(value, basestring):
            # perhaps it's already a uid
            uid = value
        else:
            uid = IUUID(value)
        for term in self._terms:
            try:
                term_uid = term.value.UID
            except AttributeError:
                term_uid = term.value
            if uid == term_uid:
                return True
        return False

    def __len__(self):
        return len(self._brains)

    def __getitem__(self, index):
        if isinstance(index, slice):
            slice_inst = index
            start = slice_inst.start
            stop = slice_inst.stop
            if not hasattr(self, "__terms"):
                return [self.createTerm(brain, None)
                        for brain in self._brains[start:stop]]
            else:
                return self.__terms[start:stop]
        else:
            if not hasattr(self, "__terms"):
                return self.createTerm(self._brains[index], None)
            else:
                return self.__terms[index]

    @property
    def _terms(self):
        if not hasattr(self, "__terms"):
            self.__terms = [self.createTerm(brain, None)
                            for brain in self._brains]
        return self.__terms


class CatalogVocabularyFactory(object):
    implements(IVocabularyFactory)

    def __call__(self, context, query=None):
        parsed = {}
        if query:
            parsed = queryparser.parseFormquery(context, query['criteria'])
            if 'sort_on' in query:
                parsed['sort_on'] = query['sort_on']
            if 'sort_order' in query:
                parsed['sort_order'] = str(query['sort_order'])
        try:
            catalog = getToolByName(context, 'portal_catalog')
        except AttributeError:
            catalog = getToolByName(getSite(), 'portal_catalog')
        brains = catalog(**parsed)
        return CatalogVocabulary.fromItems(brains, context)

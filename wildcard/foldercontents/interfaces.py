from zope.interface import Interface

from zope.filerepresentation.interfaces import IFileFactory
from zope.schema.interfaces import IVocabularyTokenized


class ILayer(Interface):
    pass


class IATCTFileFactory(IFileFactory):
    """ adapter factory for ATCT
    """


class IDXFileFactory(IFileFactory):
    """ adapter factory for DX types
    """


class ISlicableVocabulary(IVocabularyTokenized):
    def __getitem__(start, stop):
        """ return a slice of the results"""

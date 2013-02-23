from zope.interface import Interface

from zope.filerepresentation.interfaces import IFileFactory


class ILayer(Interface):
    pass


class IATCTFileFactory(IFileFactory):
    """ adapter factory for ATCT
    """


class IDXFileFactory(IFileFactory):
    """ adapter factory for DX types
    """

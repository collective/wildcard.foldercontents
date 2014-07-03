from zope.filerepresentation.interfaces import IFileFactory
from zope.interface import Interface


class ILayer(Interface):
    pass


class IATCTFileFactory(IFileFactory):
    """Adapter factory for ATCT
    """


class IDXFileFactory(IFileFactory):
    """Adapter factory for DX types
    """

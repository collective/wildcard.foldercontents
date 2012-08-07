from zope.component import getUtility
from Products.CMFCore.utils import getToolByName
from zope.component import getMultiAdapter
from AccessControl import Unauthorized
from Products.Five import BrowserView
from Acquisition import aq_inner
from plone.app.content.browser.foldercontents import FolderContentsView, \
FolderContentsTable
from plone.app.content.browser.tableview import Table
from Products.Five.browser.pagetemplatefile import ViewPageTemplateFile
from Products.statusmessages.interfaces import IStatusMessage
from plone.folder.interfaces import IExplicitOrdering
from Products.CMFPlone.interfaces.siteroot import IPloneSiteRoot
import mimetypes
from plone.i18n.normalizer.interfaces import IIDNormalizer
from zope.filerepresentation.interfaces import IFileFactory

import logging
logger = logging.getLogger("wildcard.foldercontents")


def encode(s):
    """ encode string
    """

    return "d".join(map(str, map(ord, s)))


def decode(s):
    """ decode string
    """

    return "".join(map(chr, map(int, s.split("d"))))


class NewTable(Table):
    render = ViewPageTemplateFile('table.pt')


class NewFolderContentsTable(FolderContentsTable):
    def __init__(self, context, request, contentFilter=None):
        self.context = context
        self.request = request
        self.contentFilter = contentFilter is not None and contentFilter or {}
        self.items = self.folderitems()

        url = context.absolute_url()
        view_url = url + '/folder_contents'
        self.table = NewTable(request, url, view_url, self.items,
                           show_sort_column=self.show_sort_column,
                           buttons=self.buttons)


class NewFolderContentsView(FolderContentsView):

    @property
    def orderable(self):
        if IPloneSiteRoot.providedBy(self.context):
            return True
        ordering = self.context.getOrdering()
        return IExplicitOrdering.providedBy(ordering)

    def __call__(self):
        if not self.orderable:
            messages = IStatusMessage(self.request)
            messages.add(u"This type of folder does not support ordering",
                type=u"info")
        return super(NewFolderContentsView, self).__call__(self)

    def contents_table(self):
        table = NewFolderContentsTable(aq_inner(self.context), self.request)
        return table.render()

    def uploadify(self):
        return """
    function addUploader(){
        $('#uploader').uploadify({
            'swf': portal_url + '/++resource++wcfc/uploadify/uploadify.swf',
            'uploader': $('base').attr('href') + '@@fcuploadify',
            'formData': {'cookie': '%s'},
            'onQueueComplete': function(){
                window.location.reload();
            }
        });
    }""" % encode(self.request.cookies.get('__ac', ''))


def getOrdering(context):
    if IPloneSiteRoot.providedBy(context):
        return context
    else:
        ordering = context.getOrdering()
        if not IExplicitOrdering.providedBy(ordering):
            return None
        return ordering


class Move(BrowserView):
    def __call__(self):
        ordering = getOrdering(self.context)
        authenticator = getMultiAdapter((self.context, self.request),
            name=u"authenticator")
        if not authenticator.verify() or \
                self.request['REQUEST_METHOD'] != 'POST':
            raise Unauthorized

        action = self.request.form.get('action')
        itemid = self.request.form.get('itemid')
        if action == 'movetop':
            ordering.moveObjectsToTop([itemid])
        elif action == 'movebottom':
            ordering.moveObjectsToBottom([itemid])
        elif action == 'movedelta':
            ordering.moveObjectsByDelta([itemid],
                int(self.request.form['delta']))
        return 'done'


class Sort(BrowserView):
    def __call__(self):
        authenticator = getMultiAdapter((self.context, self.request),
            name=u"authenticator")
        if not authenticator.verify() or \
                self.request['REQUEST_METHOD'] != 'POST':
            raise Unauthorized
        ordering = getOrdering(self.context)
        catalog = getToolByName(self.context, 'portal_catalog')
        brains = catalog(path={
            'query': '/'.join(self.context.getPhysicalPath()),
            'depth': 1
        }, sort_on=self.request.form.get('on'))
        if self.request.form.get('reversed'):
            brains = [b for b in reversed(brains)]
        for idx, brain in enumerate(brains):
            ordering.moveObjectToPosition(brain.id, idx)
        self.request.response.redirect(
            '%s/folder_contents' % self.context.absolute_url())


class Uploadify(BrowserView):
    """
    ripped out of collective.uploadify
    """

    def __init__(self, context, request):
        self.context = context
        self.request = request
        cookie = self.request.form["cookie"]
        self.request.cookies["__ac"] = decode(cookie)

    def generate_id(self, title):
        """ Generates a uniqe id from a specific title
        """
        normalizer = getUtility(IIDNormalizer)
        obj_id = normalizer.normalize(title)
        if obj_id in self.context.objectIds():
            obj_id = self.context.generateUniqueId(obj_id)

        return obj_id

    def __call__(self):
        file_name = self.request.form.get("Filename", "")
        file_data = self.request.form.get("Filedata", None)
        content_type = mimetypes.guess_type(file_name)[0] or ""

        if not file_data:
            return

        factory = IFileFactory(self.context)
        f = factory(file_name, content_type, file_data)
        return f.absolute_url()

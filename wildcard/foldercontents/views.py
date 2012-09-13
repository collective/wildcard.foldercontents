from zope.interface import Interface
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
from zope.filerepresentation.interfaces import IFileFactory
import json
from urllib import urlencode
from Products.ATContentTypes.interfaces.topic import IATTopic
try:
    from plone.app.collection.interfaces import ICollection
except ImportError:
    class ICollection(Interface):
        pass

import logging
logger = logging.getLogger("wildcard.foldercontents")


def _is_collection(context):
    return IATTopic.providedBy(context) or \
        ICollection.providedBy(context)


class NewTable(Table):
    render = ViewPageTemplateFile('table.pt')

    def sort_base_url(self):
        form = dict(self.request.form)
        if 'sort_on' in form:
            del form['sort_on']
        qs = urlencode(form)
        if qs:
            qs += '&'
        return '%s/@@folder_contents?%ssort_on=' % (
            self.base_url, qs)

    def ascending_url(self):
        form = dict(self.request.form)
        if 'sort_order' in form:
            del form['sort_order']
        qs = urlencode(form)
        return '%s/@@folder_contents?%s' % (
            self.base_url, qs)

    def descending_url(self):
        form = dict(self.request.form)
        form['sort_order'] = 'reverse'
        qs = urlencode(form)
        return '%s/@@folder_contents?%s' % (
            self.base_url, qs)


class NewFolderContentsTable(FolderContentsTable):
    def __init__(self, context, request, contentFilter=None):
        self.context = context
        self.request = request
        self.contentFilter = contentFilter is not None and contentFilter or {}
        sort = self.request.form.get('sort_on')
        if sort:
            self.contentFilter['sort_on'] = sort
        order = self.request.form.get('sort_order')
        if order:
            self.contentFilter['sort_order'] = 'reverse'
        self.items = self.folderitems()

        url = context.absolute_url()
        view_url = url + '/folder_contents'
        self.table = NewTable(request, url, view_url, self.items,
                           show_sort_column=self.show_sort_column,
                           buttons=self.buttons)
        self.table.is_collection = _is_collection(self.context)


class NewFolderContentsView(FolderContentsView):

    @property
    def orderable(self):
        if _is_collection(self.context):
            return False
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

    def jstemplates(self):
        """
        have to put it here because tal barfs when it's in the template
        """
        return """
<script id="template-upload" type="text/x-tmpl">
{% for (var i=0, file; file=o.files[i]; i++) { %}
    <tr class="template-upload fade">
        <td class="preview"><span class="fade"></span></td>
        <td class="name"><span>{%=file.name%}</span></td>
        <td class="size"><span>{%=o.formatFileSize(file.size)%}</span></td>
        {% if (file.error) { %}
            <td class="error" colspan="2"><span class="label label-important">{%=locale.fileupload.error%}</span> {%=locale.fileupload.errors[file.error] || file.error%}</td>
        {% } else if (o.files.valid && !i) { %}
            <td>
                <div class="progress progress-success progress-striped active" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="bar" style="width:0%;"></div></div>
            </td>
            <td class="start">{% if (!o.options.autoUpload) { %}
                <button class="btn btn-primary">
                    <i class="icon-upload icon-white"></i>
                    <span>{%=locale.fileupload.start%}</span>
                </button>
            {% } %}</td>
        {% } else { %}
            <td colspan="2"></td>
        {% } %}
        <td class="cancel">{% if (!i) { %}
            <button class="btn btn-warning">
                <i class="icon-ban-circle icon-white"></i>
                <span>{%=locale.fileupload.cancel%}</span>
            </button>
        {% } %}</td>
    </tr>
{% } %}
</script>
<!-- The template to display files available for download -->
<script id="template-download" type="text/x-tmpl">
{% for (var i=0, file; file=o.files[i]; i++) { %}
    <tr class="template-download fade">
        {% if (file.error) { %}
            <td></td>
            <td class="name"><span>{%=file.name%}</span></td>
            <td class="size"><span>{%=o.formatFileSize(file.size)%}</span></td>
            <td class="error" colspan="2"><span class="label label-important">{%=locale.fileupload.error%}</span> {%=locale.fileupload.errors[file.error] || file.error%}</td>
        {% } else { %}
            <td class="preview">{% if (file.thumbnail_url) { %}
                <a href="{%=file.url%}" title="{%=file.name%}" rel="gallery" download="{%=file.name%}"><img src="{%=file.thumbnail_url%}"></a>
            {% } %}</td>
            <td class="name">
                <a href="{%=file.url%}" title="{%=file.name%}" rel="{%=file.thumbnail_url&&'gallery'%}" download="{%=file.name%}">{%=file.name%}</a>
            </td>
            <td class="size"><span>{%=o.formatFileSize(file.size)%}</span></td>
            <td colspan="2"></td>
        {% } %}
    </tr>
{% } %}
</script>
"""


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


class JUpload(BrowserView):

    def __call__(self):
        authenticator = getMultiAdapter((self.context, self.request),
            name=u"authenticator")
        if not authenticator.verify() or \
                self.request['REQUEST_METHOD'] != 'POST':
            raise Unauthorized
        filedata = self.request.form.get("files[]", None)
        if filedata is None:
            return
        filename = filedata.filename
        content_type = mimetypes.guess_type(filename)[0] or ""

        if not filedata:
            return

        factory = IFileFactory(self.context)
        fi = factory(filename, content_type, filedata)
        result = {
            "url": fi.absolute_url(),
            "name": fi.getId(),
            "type": fi.getContentType(),
            "size": fi.getSize()}
        if fi.portal_type == 'Image':
            result['thumbnail_url'] = result['url'] + '/image_thumb'
        return json.dumps([result])
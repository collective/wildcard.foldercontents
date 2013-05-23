import logging
import mimetypes
import json
from urllib import urlencode

from Acquisition import aq_inner
from AccessControl import Unauthorized

from zope.interface import Interface
from zope.component import getMultiAdapter
from zope.filerepresentation.interfaces import IFileFactory

from plone.app.content.browser.foldercontents import (FolderContentsView,
                                                      FolderContentsTable)
from plone.app.content.browser.tableview import Table
from plone.folder.interfaces import IExplicitOrdering

from Products.CMFCore.utils import getToolByName
from Products.Five import BrowserView
from Products.Five.browser.pagetemplatefile import ViewPageTemplateFile
from Products.statusmessages.interfaces import IStatusMessage
from Products.CMFPlone.interfaces.siteroot import IPloneSiteRoot
from Products.ATContentTypes.interfaces.topic import IATTopic
try:
    from plone.app.collection.interfaces import ICollection
except ImportError:
    class ICollection(Interface):
        pass

import pkg_resources

try:
    pkg_resources.get_distribution('plone.dexterity')
except pkg_resources.DistributionNotFound:
    HAS_DEXTERITY = False
else:
    from plone.dexterity.interfaces import IDexterityFTI
    HAS_DEXTERITY = True

from wildcard.foldercontents.interfaces import IATCTFileFactory, IDXFileFactory


logger = logging.getLogger("wildcard.foldercontents")


def _normalize_form_val(form, key, default=''):
    val = form.get(key, default)
    if isinstance(val, basestring) or val is None:
        return val
    for valval in val:
        if valval and valval not in (None, 'None'):
            return valval
    return None


def _is_collection(context):
    return IATTopic.providedBy(context) or \
        ICollection.providedBy(context)


class NewTable(Table):
    render = ViewPageTemplateFile('table.pt')
    batching = ViewPageTemplateFile("batching.pt")

    def sort_base_url(self):
        form = dict(self.request.form)
        if 'sort_on' in form:
            del form['sort_on']
        qs = urlencode(form)
        if qs:
            qs += '&'
        return '%s/folder_contents?%ssort_on=' % (
            self.base_url, qs)

    def ascending_url(self):
        form = dict(self.request.form)
        if 'sort_order' in form:
            del form['sort_order']
        qs = urlencode(form)
        return '%s/folder_contents?%s' % (
            self.base_url, qs)

    def descending_url(self):
        form = dict(self.request.form)
        form['sort_order'] = 'reverse'
        qs = urlencode(form)
        return '%s/folder_contents?%s' % (
            self.base_url, qs)

    @property
    def show_all_url(self):
        return '%s&show_all=true' % (
            self.view_url)

    @property
    def selectnone_url(self):
        base = self.view_url + '&pagenumber=%s' % (self.pagenumber)
        if self.show_all:
            base += '&show_all=true'
        return base


class NewFolderContentsTable(FolderContentsTable):
    def __init__(self, context, request, contentFilter=None):
        self.context = context
        self.request = request
        self.contentFilter = contentFilter is not None and contentFilter or {}
        sort = _normalize_form_val(self.request.form, 'sort_on')
        if sort:
            self.contentFilter['sort_on'] = sort
        order = _normalize_form_val(self.request.form, 'sort_order')
        if order:
            self.contentFilter['sort_order'] = 'reverse'
        self.items = self.folderitems()

        url = context.absolute_url()
        view_url = '%s/folder_contents?sort_on=%s&sort_order=%s' % (
            url, sort, order)
        self.table = NewTable(request, url, view_url, self.items,
                           show_sort_column=self.show_sort_column,
                           buttons=self.buttons)
        self.table.is_collection = _is_collection(self.context)

    @property
    def show_sort_column(self):
        sort = _normalize_form_val(self.request.form, 'sort_on')
        return self.orderable and self.editable and \
            sort in ('', None, 'getObjPositionInParent')


class NewFolderContentsView(FolderContentsView):

    @property
    def orderable(self):
        if _is_collection(self.context):
            return False
        if IPloneSiteRoot.providedBy(self.context):
            return True
        if not hasattr(self.context, 'getOrdering'):
            return False
        ordering = self.context.getOrdering()
        return IExplicitOrdering.providedBy(ordering)

    def __call__(self):
        if not self.orderable:
            messages = IStatusMessage(self.request)
            messages.add(u"This type of folder does not support ordering",
                type=u"info")
        return super(NewFolderContentsView, self).__call__()

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
    <tr class="template-upload">
        <td class="preview"><span class=""></span></td>
        <td class="name"><span>{%=file.name%}</span></td>
        <td class="size"><span>{%=o.formatFileSize(file.size)%}</span></td>
        {% if (file.error) { %}
            <td class="error" colspan="2">
                <span class="label label-important">
                {%=locale.messagefactory(locale.fileupload.error)%}
                </span> {%=locale.messagefactory(locale.fileupload.errors[file.error]) || file.error%}
            </td>
        {% } else if (o.files.valid && !i) { %}
            <td>
                <div class="progress progress-success progress-striped active" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="bar" style="width:0%;"></div></div>
            </td>
            <td class="start">{% if (!o.options.autoUpload) { %}
                <button class="btn btn-primary">
                    <i class="icon-upload icon-white"></i>
                    <span>{%=locale.messagefactory(locale.fileupload.start)%}</span>
                </button>
            {% } %}</td>
        {% } else { %}
            <td colspan="2"></td>
        {% } %}
        <td colspan="2" class="cancel">{% if (!i) { %}
            <button class="btn btn-warning">
                <i class="icon-ban-circle icon-white"></i>
                <span>{%=locale.messagefactory(locale.fileupload.cancel)%}</span>
            </button>
        {% } %}</td>
    </tr>
{% } %}
</script>
<!-- The template to display files available for download -->
<script id="template-download" type="text/x-tmpl">
{% for (var i=0, file; file=o.files[i]; i++) { %}
    <tr class="template-download">
        {% if (file.error) { %}
            <td></td>
            <td class="name"><span>{%=file.name%}</span></td>
            <td class="size"><span>{%=o.formatFileSize(file.size)%}</span></td>
            <td class="error" colspan="2">
                <span class="label label-important">
                    {%=locale.messagefactory(locale.fileupload.error)%}
                </span> {%=locale.messagefactory(locale.fileupload.errors[file.error]) || file.error%}</td>
        {% } else { %}
            <td class="preview">{% if (file.thumbnail_url) { %}
                <a href="{%=file.url%}" title="{%=file.name%}" data-gallery="gallery" download="{%=file.name%}"><img src="{%=file.thumbnail_url%}"></a>
            {% } %}</td>
            <td class="name">
                <a href="{%=file.url%}" title="{%=file.name%}" data-gallery="{%=file.thumbnail_url&&'gallery'%}" download="{%=file.name%}">{%=file.name%}</a>
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
    """ We only support two kind of file/image types, AT or DX based (in case
        that p.a.contenttypes are installed ans assuming their type names are
        'File' and 'Image'.
    """
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

        # Determine if the default file/image types are DX or AT based
        ctr = getToolByName(self.context, 'content_type_registry')
        type_ = ctr.findTypeName(filename.lower(), '', '') or 'File'

        DX_BASED = False
        if HAS_DEXTERITY:
            pt = getToolByName(self.context, 'portal_types')
            if IDexterityFTI.providedBy(getattr(pt, type_)):
                factory = IDXFileFactory(self.context)
                DX_BASED = True
            else:
                factory = IATCTFileFactory(self.context)
        else:
            factory = IATCTFileFactory(self.context)

        obj = factory(filename, content_type, filedata)

        if DX_BASED:
            if 'File' in obj.portal_type:
                size = obj.file.getSize()
                content_type = obj.file.contentType
            elif 'Image' in obj.portal_type:
                size = obj.image.getSize()
                content_type = obj.image.contentType

            result = {
                "url": obj.absolute_url(),
                "name": obj.getId(),
                "type": content_type,
                "size": size
            }
        else:
            try:
                size = obj.getSize()
            except AttributeError:
                size = obj.getObjSize()

            result = {
                "url": obj.absolute_url(),
                "name": obj.getId(),
                "type": obj.getContentType(),
                "size": size
            }

        if 'Image' in obj.portal_type:
            result['thumbnail_url'] = result['url'] + '/@@images/image/tile'

        return json.dumps({
            'files': [result]
        })

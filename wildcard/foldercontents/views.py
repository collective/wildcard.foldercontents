from .interfaces import IATCTFileFactory
from .interfaces import IDXFileFactory
from .jstemplates import NEW_FOLDER_CONTENTS_VIEW_JS_TEMPLATES
from AccessControl import Unauthorized
from Acquisition import aq_inner
from Products.ATContentTypes.interfaces.topic import IATTopic
from Products.CMFCore.utils import getToolByName
from Products.CMFPlone.interfaces.constrains import ISelectableConstrainTypes
from Products.CMFPlone.interfaces.siteroot import IPloneSiteRoot
from Products.Five import BrowserView
from Products.Five.browser.pagetemplatefile import ViewPageTemplateFile
from Products.statusmessages.interfaces import IStatusMessage
from plone.app.content.browser.foldercontents import FolderContentsTable
from plone.app.content.browser.foldercontents import FolderContentsView
from plone.app.content.browser.tableview import Table
from plone.folder.interfaces import IExplicitOrdering
from urllib import urlencode
from wildcard.foldercontents import wcfcMessageFactory as _
from zope.component import getMultiAdapter
from zope.i18n import translate
from zope.interface import Interface
import json
import logging
import mimetypes
import pkg_resources

try:
    pkg_resources.get_distribution('plone.app.collection')
except pkg_resources.DistributionNotFound:
    class ICollection(Interface):
        pass
else:
    from plone.app.collection.interfaces import ICollection


try:
    pkg_resources.get_distribution('plone.dexterity')
except pkg_resources.DistributionNotFound:
    HAS_DEXTERITY = False
else:
    from plone.dexterity.interfaces import IDexterityFTI
    HAS_DEXTERITY = True


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
        """Have to include js templates from view, because tal barfs when it's
        in the page template
        """
        return NEW_FOLDER_CONTENTS_VIEW_JS_TEMPLATES

    @property
    def context_base_url(self):
        context = aq_inner(self.context)
        layout = getMultiAdapter((context, self.request), name=u'plone_layout')
        return layout.renderBase()


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
    """We only support two kind of file/image types, AT or DX based (in case
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

        ctr = getToolByName(self.context, 'content_type_registry')
        type_ = ctr.findTypeName(filename.lower(), '', '') or 'File'

        # Determine if the default file/image types are DX or AT based
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

        if DX_BASED:
            addable_types = ISelectableConstrainTypes(
                self.context).getImmediatelyAddableTypes()
        else:
            addable_types = self.context.getImmediatelyAddableTypes()

        #if the type_ is disallowed in this folder, return an error
        if type_ not in addable_types:
            msg = translate(
                _('disallowed_type_error',
                    default='${filename}: adding of "${type}" \
                             type is disabled in this folder',
                    mapping={'filename': filename, 'type': type_}),
                context=self.request
            )
            return json.dumps({'files': [{'error': msg}]})

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

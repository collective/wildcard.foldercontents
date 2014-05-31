# XXX This is all ripped out of plone.app.toolbar

from AccessControl import Unauthorized
from AccessControl import getSecurityManager
from Acquisition import aq_inner
from Acquisition import aq_parent

from DateTime import DateTime

import inspect
import json

from logging import getLogger
import os
from OFS.CopySupport import CopyError
import mimetypes
import pkg_resources

from plone.app.querystring.interfaces import IQuerystringRegistryReader
from plone.folder.interfaces import IExplicitOrdering
from plone.protect.postonly import check as checkpost
from plone.registry.interfaces import IRegistry
from plone.uuid.interfaces import IUUID

from Products.CMFCore.interfaces._content import IFolderish
from Products.CMFCore.utils import getToolByName

from Products.CMFPlone import utils
from Products.CMFPlone import PloneMessageFactory as _
from Products.CMFPlone.interfaces.siteroot import IPloneSiteRoot

from Products.Five import BrowserView
from Products.ZCTextIndex.ParseTree import ParseError

import transaction
from types import FunctionType

from wildcard.foldercontents.interfaces import ISlicableVocabulary
from wildcard.foldercontents.interfaces import IATCTFileFactory, IDXFileFactory
from Products.ResourceRegistries.browser.scripts import (
    ScriptsView as BaseScriptsView
)

from zope.component import queryUtility, getUtility, getMultiAdapter
from zope.component.hooks import getSite

from zope.browsermenu.interfaces import IBrowserMenu
from zope.event import notify
from zope.lifecycleevent import ObjectModifiedEvent
from ZODB.POSException import ConflictError
from zope.schema.interfaces import IVocabularyFactory


try:
    pkg_resources.get_distribution('plone.dexterity')
except pkg_resources.DistributionNotFound:
    HAS_DEXTERITY = False
else:
    from plone.dexterity.interfaces import IDexterityFTI
    HAS_DEXTERITY = True


logger = getLogger(__name__)


def _bool(val):
    if val.lower() in ('t', 'true', '1', 'on'):
        return True
    return False


def _tus_int(val):
    try:
        return int(val)
    except:
        return 60*60  # default here...


possible_tus_options = {
    'tmp_file_dir': str,
    'send_file': _bool,
    'upload_valid_duration': _tus_int
}

TUS_ENABLED = False
if os.environ.get('TUS_ENABLED'):
    try:
        from tus import Tus, Zope2RequestAdapter
        tus_settings = {}
        for option, converter in possible_tus_options.items():
            name = 'TUS_%s' % option.upper()
            if name in os.environ:
                tus_settings[option] = converter(os.environ[name])

            tmp_file_dir = tus_settings.get('tmp_file_dir')
            if tmp_file_dir is None:
                logger.warn('You are trying to enable tus but no'
                            'TUS_TMP_FILE_DIR environment setting is set.')
            elif not os.path.exists(tmp_file_dir) or \
                    not os.path.isdir(tmp_file_dir):
                logger.warn('The TUS_TMP_FILE_DIR does not point to a valid '
                            'directory.')
            elif not os.access(tmp_file_dir, os.W_OK):
                logger.warn('The TUS_TMP_FILE_DIR is not writable')
            else:
                TUS_ENABLED = True
    except ImportError:
        pass


class FolderContentsView(BrowserView):

    def is_plone_41(self):
        try:
            from plone.app.upgrade import v42
            v42  # pyflakes
            return False
        except:
            return True

    def __call__(self):
        site = getSite()
        base_url = site.absolute_url()
        base_vocabulary = '%s/@@wcVocabulary?name=' % base_url
        site_path = site.getPhysicalPath()
        context_path = self.context.getPhysicalPath()
        options = {
            'vocabularyUrl':
            '%swildcard.foldercontents.vocabularies.Catalog' % (
                base_vocabulary),
            'tagsVocabularyUrl': '%splone.app.vocabularies.Keywords' % (
                base_vocabulary),
            'usersVocabularyUrl': '%splone.app.vocabularies.Users' % (
                base_vocabulary),
            'moveUrl': '%s{path}/fc-itemOrder' % base_url,
            'indexOptionsUrl': '%s/@@qsOptions' % base_url,
            'contextInfoUrl': '%s{path}/@@fc-contextInfo' % base_url,
            'setDefaultPageUrl': '%s{path}/@@fc-setDefaultPage' % base_url,
            'buttonGroups': {
                'primary': [{
                    'title': 'Cut',
                }, {
                    'title': 'Copy',
                }, {
                    'title': 'Paste',
                    'url': base_url + '{path}/@@fc-paste'
                }, {
                    'title': 'Delete',
                    'url': base_url + '/@@fc-delete',
                    'context': 'danger',
                    'icon': 'trash'
                }],
                'secondary': [{
                    'title': 'Workflow',
                    'url': base_url + '/@@fc-workflow'
                }, {
                    'title': 'Tags',
                    'url': base_url + '/@@fc-tags'
                }, {
                    'title': 'Properties',
                    'url': base_url + '/@@fc-properties'
                }, {
                    'title': 'Rename',
                    'url': base_url + '/@@fc-rename'
                }]
            },
            'rearrange': {
                'properties': {
                    'id': 'ID',
                    'sortable_title': 'Title',
                    'modified': 'Last Modified',
                    'created': 'Created on',
                    'effective': 'Publication Date',
                    'Type': 'Type'
                },
                'url': '%s{path}/@@fc-sort' % base_url
            },
            'basePath': '/' + '/'.join(context_path[len(site_path):]),
            'upload': {
                'relativePath': 'wcFileUpload',
                'baseUrl': base_url,
                'initialFolder': IUUID(self.context, None),
                'useTus': TUS_ENABLED
            }
        }
        self.options = json.dumps(options)
        return super(FolderContentsView, self).__call__()


class FolderContentsActionView(BrowserView):

    success_msg = _('Success')
    failure_msg = _('Failure')
    required_obj_permission = None

    def objectTitle(self, obj):
        context = aq_inner(obj)
        title = utils.pretty_title_or_id(context, context)
        return utils.safe_unicode(title)

    def protect(self):
        authenticator = getMultiAdapter((self.context, self.request),
                                        name='authenticator')
        if not authenticator.verify():
            raise Unauthorized
        checkpost(self.request)

    def json(self, data):
        self.request.response.setHeader("Content-Type", "application/json")
        return json.dumps(data)

    def get_selection(self):
        selection = self.request.form.get('selection', '[]')
        return json.loads(selection)

    def action(self, obj):
        """
        fill in this method to do action against each item in the selection
        """
        pass

    def __call__(self):
        self.protect()
        self.errors = []
        site = getSite()
        context = aq_inner(self.context)
        selection = self.get_selection()

        self.dest = site.restrictedTraverse(
            str(self.request.form['folder'].lstrip('/')))

        self.catalog = getToolByName(context, 'portal_catalog')
        self.mtool = getToolByName(self.context, 'portal_membership')

        for brain in self.catalog(UID=selection):
            selection.remove(brain.UID)  # remove everyone so we know if we
                                         # missed any
            obj = brain.getObject()
            if self.required_obj_permission:
                if not self.mtool.checkPermission(self.required_obj_permission,
                                                  obj):
                    self.errors.append(_('Permission denied for "${title}"',
                                         mapping={
                                             'title': self.objectTitle(obj)
                                         }))
            self.action(obj)

        return self.message(selection)

    def message(self, missing=[]):
        if len(missing) > 0:
            self.errors.append(_('${items} could not be found', mapping={
                'items': str(len(missing))}))
        if not self.errors:
            msg = self.success_msg
        else:
            msg = self.failure_msg

        return self.json({
            'status': 'success',
            'msg': '%s: %s' % (msg, '\n'.join(self.errors))
        })


class PasteAction(FolderContentsActionView):
    success_msg = _('Successfully pasted all items')
    failure_msg = _('Error during paste, some items were not pasted')
    required_obj_permission = 'Copy or Move'

    def copy(self, obj):
        title = self.objectTitle(obj)
        parent = obj.aq_inner.aq_parent
        try:
            parent.manage_copyObjects(obj.getId(), self.request)
        except CopyError:
            self.errors.append(_(u'${title} is not copyable.',
                                 mapping={u'title': title}))

    def cut(self, obj):
        title = self.objectTitle(obj)

        try:
            lock_info = obj.restrictedTraverse('@@plone_lock_info')
        except AttributeError:
            lock_info = None

        if lock_info is not None and lock_info.is_locked():
            self.errors.append(_(u'${title} is locked and cannot be cut.',
                                 mapping={u'title': title}))

        parent = obj.aq_inner.aq_parent
        try:
            parent.manage_cutObjects(obj.getId(), self.request)
        except CopyError:
            self.errors.append(_(u'${title} is not moveable.',
                                 mapping={u'title': title}))

    def action(self, obj):
        operation = self.request.form['pasteOperation']
        if operation == 'copy':
            self.copy(obj)
        else:  # cut
            self.cut(obj)
        if self.errors:
            return
        try:
            self.dest.manage_pasteObjects(self.request['__cp'])
        except ConflictError:
            raise
        except Unauthorized:
            # avoid this unfriendly exception text:
            # "You are not allowed to access 'manage_pasteObjects' in this
            # context"
            self.errors.append(
                _(u'You are not authorized to paste ${title} here.',
                    mapping={u'title': self.objectTitle(obj)}))


class DeleteAction(FolderContentsActionView):

    def action(self, obj):
        parent = obj.aq_inner.aq_parent
        title = self.objectTitle(obj)

        try:
            lock_info = obj.restrictedTraverse('@@plone_lock_info')
        except AttributeError:
            lock_info = None

        if lock_info is not None and lock_info.is_locked():
            self.errors.append(_(u'${title} is locked and cannot be deleted.',
                                 mapping={u'title': title}))
            return
        else:
            parent.manage_delObjects(obj.getId())


class RenameAction(FolderContentsActionView):
    success_msg = _('Items renamed')
    failure_msg = _('Failed to rename all items')

    def __call__(self):
        self.errors = []
        self.protect()
        context = aq_inner(self.context)

        torename = json.loads(self.request.form['torename'])

        catalog = getToolByName(context, 'portal_catalog')
        mtool = getToolByName(context, 'portal_membership')

        missing = []
        for data in torename:
            uid = data['UID']
            brains = catalog(UID=uid)
            if len(brains) == 0:
                missing.append(uid)
                continue
            obj = brains[0].getObject()
            title = self.objectTitle(obj)
            if not mtool.checkPermission('Copy or Move', obj):
                self.errors(_(u'Permission denied to rename ${title}.',
                              mapping={u'title': title}))
                continue

            sp = transaction.savepoint(optimistic=True)

            newid = data['newid'].encode('utf8')
            newtitle = data['newtitle']
            try:
                obid = obj.getId()
                title = obj.Title()
                change_title = newtitle and title != newtitle
                if change_title:
                    getSecurityManager().validate(obj, obj, 'setTitle',
                                                  obj.setTitle)
                    obj.setTitle(newtitle)
                    notify(ObjectModifiedEvent(obj))
                if newid and obid != newid:
                    parent = aq_parent(aq_inner(obj))
                    parent.manage_renameObjects((obid,), (newid,))
                elif change_title:
                    # the rename will have already triggered a reindex
                    obj.reindexObject()
            except ConflictError:
                raise
            except Exception:
                sp.rollback()
                self.errors.append(_('Error renaming ${title}', mapping={
                    'title': title}))

        return self.message(missing)


class TagsAction(FolderContentsActionView):
    required_obj_permission = 'Modify portal content'

    def __call__(self):
        self.remove = set(json.loads(self.request.form.get('remove')))
        self.add = set(json.loads(self.request.form.get('add')))
        return super(TagsAction, self).__call__()

    def action(self, obj):
        tags = set(obj.Subject())
        tags = tags - self.remove
        tags = tags | self.add
        obj.setSubject(list(tags))
        obj.reindexObject()


class WorkflowAction(FolderContentsActionView):
    required_obj_permission = 'Modify portal content'

    def __call__(self):
        self.pworkflow = getToolByName(self.context, 'portal_workflow')
        self.putils = getToolByName(self.context, 'plone_utils')
        self.transition_id = self.request.form.get('transition', None)
        self.comments = self.request.form.get('comments', '')
        self.recurse = self.request.form.get('recurse', 'no') == 'yes'
        if self.request.REQUEST_METHOD == 'POST':
            return super(WorkflowAction, self).__call__()
        else:
            # for GET, we return available transitions
            selection = self.get_selection()
            catalog = getToolByName(self.context, 'portal_catalog')
            brains = catalog(UID=selection)
            transitions = []
            for brain in brains:
                obj = brain.getObject()
                for transition in self.pworkflow.getTransitionsFor(obj):
                    tdata = {
                        'id': transition['id'],
                        'title': transition['name']
                    }
                    if tdata not in transitions:
                        transitions.append(tdata)
            return self.json({
                'transitions': transitions
            })

    def action(self, obj):
        transitions = self.pworkflow.getTransitionsFor(obj)
        if self.transition_id in [t['id'] for t in transitions]:
            try:
                # set effective date if not already set
                if obj.EffectiveDate() == 'None':
                    obj.setEffectiveDate(DateTime())

                self.pworkflow.doActionFor(obj, self.transition_id,
                                           comment=self.comments)
                if self.putils.isDefaultPage(obj):
                    self.action(obj.aq_parent.aq_parent)
                if self.recurse and IFolderish.providedBy(obj):
                    for sub in obj.values():
                        self.action(sub)
            except ConflictError:
                raise
            except Exception:
                self.errors.append('Could not transition: %s' % (
                    self.objectTitle(obj)))


class PropertiesAction(FolderContentsActionView):
    success_msg = _(u'Successfully updated metadata')
    failure_msg = _(u'Failure updating metadata')
    required_obj_permission = 'Modify portal content'

    def __call__(self):
        self.effectiveDate = self.request.form['effectiveDate']
        effectiveTime = self.request.form['effectiveTime']
        if effectiveTime:
            self.effectiveDate = self.effectiveDate + ' ' + effectiveTime
        self.expirationDate = self.request.form['expirationDate']
        expirationTime = self.request.form['expirationTime']
        if expirationTime:
            self.expirationDate = self.expirationDate + ' ' + expirationTime
        self.copyright = self.request.form.get('copyright', '')
        self.contributors = json.loads(
            self.request.form.get('contributors', '[]'))
        self.creators = json.loads(self.request.form.get('creators', '[]'))
        self.exclude = self.request.form.get('exclude_from_nav', None)
        return super(PropertiesAction, self).__call__()

    def action(self, obj):
        if self.effectiveDate:
            obj.setEffectiveDate(DateTime(self.effectiveDate))
        if self.expirationDate:
            obj.setExpirationDate(DateTime(self.expirationDate))
        if self.copyright:
            obj.setRights(self.copyright)
        if self.contributors:
            obj.setContributors([c['id'] for c in self.contributors])
        if self.creators:
            obj.setCreators([c['id'] for c in self.creators])
        if self.exclude:
            obj.setExcludeFromNav(self.exclude == 'yes')
        obj.reindexObject()


class ItemOrder(FolderContentsActionView):
    success_msg = _('Successfully moved item')
    failure_msg = _('Error moving item')

    def getOrdering(self):
        if IPloneSiteRoot.providedBy(self.context):
            return self.context
        else:
            ordering = self.context.getOrdering()
            if not IExplicitOrdering.providedBy(ordering):
                return None
            return ordering

    def __call__(self):
        self.errors = []
        self.protect()
        id = self.request.form.get('id')
        ordering = self.getOrdering()
        delta = self.request.form['delta']
        subset_ids = json.loads(self.request.form.get('subset_ids', '[]'))

        if delta == 'top':
            ordering.moveObjectsToTop([id])
        elif delta == 'bottom':
            ordering.moveObjectsToBottom([id])
        else:
            delta = int(delta)
            if subset_ids:
                position_id = [(ordering.getObjectPosition(i), i)
                               for i in subset_ids]
                position_id.sort()
                if subset_ids != [i for position, i in position_id]:
                    self.errors.append(_('Client/server ordering mismatch'))
                    return self.message()

            ordering.moveObjectsByDelta([id], delta)
        return self.message()


class SetDefaultPage(FolderContentsActionView):
    success_msg = _(u'Default page set successfully')
    failure_msg = _(u'Failed to set default page')

    def __call__(self):
        id = self.request.form.get('id')
        self.errors = []

        if id not in self.context.objectIds():
            self.errors.append(
                _(u'There is no object with short name '
                  u'${name} in this folder.',
                  mapping={u'name': id}))
        else:
            self.context.setDefaultPage(id)
        return self.message()


class ContextInfo(BrowserView):

    attributes = ['UID', 'Title', 'Type', 'path', 'review_state',
                  'ModificationDate', 'EffectiveDate', 'CreationDate',
                  'is_folderish', 'Subject', 'getURL', 'id',
                  'exclude_from_nav', 'getObjSize', 'last_comment_date',
                  'total_comments']

    def __call__(self):
        factories_menu = getUtility(
            IBrowserMenu, name='plone_contentmenu_factory',
            context=self.context).getMenuItems(self.context, self.request)
        factories_menu = [m for m in factories_menu
                          if m.get('title') != 'folder_add_settings']

        context = aq_inner(self.context)
        crumbs = []
        while not IPloneSiteRoot.providedBy(context):
            crumbs.append({
                'id': context.getId(),
                'title': utils.pretty_title_or_id(context, context)
            })
            context = utils.parent(context)

        catalog = getToolByName(self.context, 'portal_catalog')
        try:
            brains = catalog(UID=IUUID(self.context))
        except TypeError:
            brains = []
        item = None
        if len(brains) > 0:
            obj = brains[0]
            # context here should be site root
            base_path = '/'.join(context.getPhysicalPath())
            item = {}
            for attr in self.attributes:
                key = attr
                if key == 'path':
                    attr = 'getPath'
                val = getattr(obj, attr, None)
                if callable(val):
                    if attr in _safe_callable_metadata:
                        val = val()
                    else:
                        continue
                if key == 'path':
                    val = val[len(base_path):]
                item[key] = val

        return json.dumps({
            'addButtons': factories_menu,
            'defaultPage': self.context.getDefaultPage(),
            'breadcrumbs': [c for c in reversed(crumbs)],
            'object': item
        })


def getOrdering(context):
    if IPloneSiteRoot.providedBy(context):
        return context
    else:
        ordering = context.getOrdering()
        if not IExplicitOrdering.providedBy(ordering):
            return None
        return ordering


class Sort(FolderContentsActionView):
    def __call__(self):
        self.protect()
        self.errors = []
        ordering = getOrdering(self.context)
        if ordering:
            catalog = getToolByName(self.context, 'portal_catalog')
            brains = catalog(path={
                'query': '/'.join(self.context.getPhysicalPath()),
                'depth': 1
            }, sort_on=self.request.form.get('sort_on'))
            if self.request.form.get('reversed') == 'true':
                brains = [b for b in reversed(brains)]
            for idx, brain in enumerate(brains):
                ordering.moveObjectToPosition(brain.id, idx)
        else:
            self.errors.append(u'cannot sort folder')
        return self.message()


class QueryStringIndexOptions(BrowserView):

    def __call__(self):
        registry = getUtility(IRegistry)
        config = IQuerystringRegistryReader(registry)()
        self.request.response.setHeader("Content-Type", "application/json")
        return json.dumps(config)


_permissions = {
    'plone.app.vocabularies.Users': 'Modify portal content',
    'plone.app.vocabularies.Catalog': 'View',
    'plone.app.vocabularies.Keywords': 'Modify portal content',
    'plone.app.vocabularies.SyndicatableFeedItems': 'Modify portal content',
    'wildcard.foldercontents.vocabularies.Catalog': 'View'
}


def _parseJSON(s):
    if isinstance(s, basestring):
        s = s.strip()
        if (s.startswith('{') and s.endswith('}')) or \
                (s.startswith('[') and s.endswith(']')):  # detect if json
            return json.loads(s)
    return s


_unsafe_metadata = ['Creator', 'listCreators', 'author_name', 'commentors']
_safe_callable_metadata = ['getURL', 'getPath']


class VocabularyView(BrowserView):

    def error(self):
        return json.dumps({
            'results': [],
            'total': 0,
            'error': True
        })

    def __call__(self):
        """
        Accepts GET parameters of:
        name: Name of the vocabulary
        query: string or json object of criteria and options.
            json value consists of a structure:
                {
                    criteria: object,
                    sort_on: index,
                    sort_order: (asc|reversed)
                }
        attributes: comma seperated, or json object list
        batch: {
            page: 1-based page of results,
            size: size of paged results
        }
        """
        self.request.response.setHeader("Content-type", "application/json")

        factory_name = self.request.get('name', None)
        if not factory_name:
            return json.dumps({'error': 'No factory provided.'})
        if factory_name not in _permissions:
            return json.dumps({'error': 'Vocabulary lookup not allowed'})
        sm = getSecurityManager()
        if not sm.checkPermission(_permissions[factory_name], self.context):
            raise Unauthorized('You do not have permission to use this '
                               'vocabulary')
        factory = queryUtility(IVocabularyFactory, factory_name)
        if not factory:
            return json.dumps({
                'error': 'No factory with name "%s" exists.' % factory_name})

        # check if factory accepts query argument
        query = _parseJSON(self.request.get('query', ''))
        batch = _parseJSON(self.request.get('batch', ''))

        if type(factory) is FunctionType:
            factory_spec = inspect.getargspec(factory)
        else:
            factory_spec = inspect.getargspec(factory.__call__)
        try:
            supports_query = False
            supports_batch = False
            if query and len(factory_spec.args) >= 3 and \
                    factory_spec.args[2] == 'query':
                supports_query = True
                if len(factory_spec.args) >= 4 and \
                        factory_spec.args[3] == 'batch':
                    supports_batch = True
            if (not supports_query and query):
                raise KeyError("The vocabulary factory %s does not support "
                               "query arguments",
                               factory)
            if batch and supports_batch:
                    vocabulary = factory(self.context, query, batch)
            elif query:
                    vocabulary = factory(self.context, query)
            else:
                vocabulary = factory(self.context)
        except (TypeError, ParseError):
            raise
            return self.error()

        try:
            total = len(vocabulary)
        except TypeError:
            total = 0  # do not error if object does not support __len__
                       # we'll check again later if we can figure some size
                       # out
        if batch and ('size' not in batch or 'page' not in batch):
            batch = None  # batching not providing correct options
            logger.error("A vocabulary request contained bad batch "
                         "information. The batch information is ignored.")
        if batch and not supports_batch and \
                ISlicableVocabulary.providedBy(vocabulary):
            # must be slicable for batching support
            page = int(batch['page'])
            # page is being passed in is 1-based
            start = (max(page-1, 0)) * int(batch['size'])
            end = start + int(batch['size'])
            vocabulary = vocabulary[start:end]

        items = []

        attributes = _parseJSON(self.request.get('attributes', ''))
        if isinstance(attributes, basestring) and attributes:
            attributes = attributes.split(',')

        if attributes:
            base_path = '/'.join(self.context.getPhysicalPath())
            for vocab_item in vocabulary:
                item = {}
                for attr in attributes:
                    key = attr
                    if ':' in attr:
                        key, attr = attr.split(':', 1)
                    if attr in _unsafe_metadata:
                        continue
                    if key == 'path':
                        attr = 'getPath'
                    vocab_value = vocab_item.value
                    val = getattr(vocab_value, attr, None)
                    if callable(val):
                        if attr in _safe_callable_metadata:
                            val = val()
                        else:
                            continue
                    if key == 'path':
                        val = val[len(base_path):]
                    item[key] = val
                items.append(item)
        else:
            for item in vocabulary:
                items.append({'id': item.token, 'text': item.title})

        if total == 0:
            total = len(items)

        return json.dumps({
            'results': items,
            'total': total
        })


class FileUploadView(BrowserView):
    """
    Handle file uploads with potential
    special handling of TUS resumable uploads
    """

    tus_uid = None

    def __contains__(self, uid):
        return self.tus_uid and self.tus_uid == uid

    def __getitem__(self, uid):
        if self.tus_uid is None:
            self.tus_uid = uid
            self.__doc__ = 'foobar'  # why is this necessary?
            return self
        else:
            raise KeyError

    def __call__(self):
        req = self.request
        tusrequest = False
        if TUS_ENABLED:
            adapter = Zope2RequestAdapter(req)
            tus = Tus(adapter, **tus_settings)
            if tus.valid:
                tusrequest = True
                tus.handle()
                if not tus.upload_finished:
                    return
                else:
                    filename = req.getHeader('FILENAME')
                    if tus.send_file:
                        filedata = req._file
                        filedata.filename = filename
                    else:
                        filepath = req._file.read()
                        filedata = open(filepath)
        if not tusrequest:
            if req.REQUEST_METHOD != 'POST':
                return
            filedata = self.request.form.get("file", None)
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
                "type": content_type,
                "size": size
            }
        else:
            try:
                size = obj.getSize()
            except AttributeError:
                size = obj.getObjSize()

            result = {
                "type": obj.getContentType(),
                "size": size
            }

        if tusrequest:
            tus.cleanup_file()
        result.update({
            'url': obj.absolute_url(),
            'name': obj.getId(),
            'UID': IUUID(obj),
            'filename': filename
        })
        return json.dumps(result)


class ScriptsView(BaseScriptsView):
    """
    prevent portal_javascripts js loading on folder contents page
    """

    def scripts(self):
        data = super(ScriptsView, self).scripts()
        if '/folder_contents' in self.request.URL:
            # remove plone.app.widgets js and add jquery
            if 'plone.app.widgets' in data[0].get('src'):
                data.pop(0)
                data.insert(0, {
                    'inline': False,
                    'conditionalcomment': '',
                    'src': '%s/++resource++plone.app.jquery.js' % (
                        getSite().absolute_url())})
        return data

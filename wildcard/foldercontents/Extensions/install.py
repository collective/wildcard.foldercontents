# -*- coding: utf-8 -*-

import logging
logger = logging.getLogger('wildcard.foldercontents')


def uninstall(portal, reinstall=False):
    setup_tool = portal.portal_setup
    setup_tool.runAllImportStepsFromProfile('profile-wildcard.foldercontents:uninstall')
    logger.info("Uninstalled")

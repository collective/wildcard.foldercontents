# -*- coding:utf-8 -*-
from setuptools import find_packages
from setuptools import setup

import os

version = '2.0b4'
description = 'A backport of the Plone 5 folder contents implementation.'
long_description = (
    open('README.txt').read() + '\n' +
    open(os.path.join("docs", "HISTORY.txt")).read()
)

setup(name='wildcard.foldercontents',
      version=version,
      description=description,
      long_description=long_description,
      classifiers=[
          'Development Status :: 4 - Beta',
          'Environment :: Web Environment',
          'Framework :: Plone',
          'Framework :: Plone :: 4.1',
          'Framework :: Plone :: 4.2',
          'Framework :: Plone :: 4.3',
          'Intended Audience :: Developers',
          'Intended Audience :: System Administrators',
          'License :: OSI Approved :: GNU General Public License v2 (GPLv2)',
          'Operating System :: OS Independent',
          'Programming Language :: Python',
          'Programming Language :: Python :: 2.7',
          'Topic :: Software Development :: Libraries :: Python Modules',
      ],
      keywords='plone folder contents drag drop upload reorder sort',
      author='Nathan Van Gheem',
      author_email='vangheem@gmail.com',
      url='https://github.com/collective/wildcard.foldercontents',
      packages=find_packages(exclude=['ez_setup']),
      namespace_packages=['wildcard'],
      include_package_data=True,
      zip_safe=False,
      install_requires=[
          'AccessControl',
          'Acquisition',
          'jarn.jsi18n',
          'plone.app.querystring>=1.1.0',
          'plone.dexterity',
          'plone.namedfile',
          'plone.registry',
          'Products.Archetypes',
          'Products.CMFCore',
          'Products.CMFPlone>=4.1',
          'Products.GenericSetup',
          'setuptools',
          'zope.component',
          'zope.container',
          'zope.event',
          'zope.interface',
          'zope.lifecycleevent',
          'zope.schema',
      ],
      extras_require={
          'tus': [
              'tus',
          ],
          'test': [
              'Products.PloneTestCase',
          ],
      },
      entry_points="""
      # -*- Entry points: -*-

      [z3c.autoinclude.plugin]
      target = plone
      """
      )

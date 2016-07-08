from setuptools import setup, find_packages
import os

version = '1.3.3'

setup(
    name='wildcard.foldercontents',
    version=version,
    description="better folder contents implementation",
    long_description=open("README.txt").read() + "\n" +
    open(os.path.join("docs", "HISTORY.txt")).read(),
    # Get more strings from
    # http://pypi.python.org/pypi?%3Aaction=list_classifiers
    classifiers=[
        "Framework :: Plone",
        "Programming Language :: Python",
    ],
    keywords='plone folder contents drag drop upload reorder sort',
    author='Nathan Van Gheem',
    author_email='vangheem@gmail.com',
    url='https://github.com/collective/wildcard.foldercontents',
    license='GPL',
    packages=find_packages(exclude=['ez_setup']),
    namespace_packages=['wildcard'],
    include_package_data=True,
    zip_safe=False,
    install_requires=[
        'setuptools',
        'jarn.jsi18n',
    ],
    entry_points="""
      # -*- Entry points: -*-

      [z3c.autoinclude.plugin]
      target = plone
      """
)

#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Tests for the Python tools, which the node suite does not reach.

The tools are developer-facing rather than shipped, but this one decides
which registrations to delete, and a wrong answer there removes the copy of
the extension Safari is actually using.

    python3 test/tools.test.py
"""

import importlib.util
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location(
    "csr", ROOT / "tools" / "clean-safari-registrations.py")
csr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(csr)

HOME = os.path.expanduser("~")
DERIVED = f"{HOME}/Library/Developer/Xcode/DerivedData/Year_First-abc123"
BUILT = {"Release": f"{DERIVED}/Build/Products/Release/Year First.app",
         "Debug": f"{DERIVED}/Build/Products/Debug/Year First.app"}
APPEX = "Contents/PlugIns/Year First Extension.appex"


class Origin(unittest.TestCase):
    def label(self, path):
        return csr.origin(path, BUILT)

    def test_the_installed_copy(self):
        self.assertEqual(self.label(f"/Applications/Year First.app/{APPEX}"), "installed")
        self.assertEqual(self.label("/Applications/Year First.app"), "installed")

    def test_build_products_name_their_configuration(self):
        self.assertEqual(self.label(f"{BUILT['Debug']}/{APPEX}"), "build:Debug")
        self.assertEqual(self.label(f"{BUILT['Release']}/{APPEX}"), "build:Release")

    def test_an_archive_names_the_archive(self):
        # Archiving registers a third copy. This used to come out as
        # "unknown", so the post-action's line during an archive read as
        # something going wrong rather than as the expected cleanup.
        p = (f"{HOME}/Library/Developer/Xcode/Archives/2026-08-30/"
             f"Year First 1.0.2 (2).xcarchive/Products/Applications/Year First.app/{APPEX}")
        self.assertEqual(self.label(p), "archive:Year First 1.0.2 (2)")

    def test_an_archive_named_the_way_xcode_names_them(self):
        # U+202F before PM, which is what macOS actually writes.
        p = (f"{HOME}/Library/Developer/Xcode/Archives/2026-08-30/"
             f"Year First 8-30-26, 5.58 PM.xcarchive/Products/Applications/Year First.app/{APPEX}")
        self.assertEqual(self.label(p), "archive:Year First 8-30-26, 5.58 PM")

    def test_other_build_trees_are_still_builds(self):
        # Index.noindex is Xcode's indexing build, outside Build/Products.
        p = f"{DERIVED}/Index.noindex/Build/Products/Debug/Year First.app/{APPEX}"
        self.assertEqual(self.label(p), "build:other")

    def test_anything_else_is_unknown(self):
        self.assertEqual(self.label(f"/Users/someone/Desktop/Year First.app/{APPEX}"), "unknown")

    def test_a_prefix_is_not_a_parent(self):
        # This is the one that matters: "installed" decides what is KEPT, so a
        # path that merely starts with the same characters must not be taken
        # for it -- that would keep the wrong copy and delete the real one.
        self.assertEqual(self.label(f"/Applications/Year First.app.evil/{APPEX}"), "unknown")
        self.assertNotEqual(self.label(f"/Applications/Year First.appx/{APPEX}"), "installed")

    def test_a_stray_copy_inside_DerivedData_is_still_a_build(self):
        # Not "unknown": it is not the configuration's product, but it is
        # build output, and it is right to treat it as removable.
        self.assertEqual(self.label(f"{BUILT['Debug']}.old/{APPEX}"), "build:other")


if __name__ == "__main__":
    unittest.main(verbosity=2)

import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('portrait_import',Path(__file__).with_name('import-portraits.py'))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def metadata(name,url='',artist='Example Photographer',copyrighted='True'):
    return {key:{'value':value} for key,value in {'LicenseShortName':name,'LicenseUrl':url,'Artist':artist,'Copyrighted':copyrighted}.items()}

class LicensingTests(unittest.TestCase):
    def test_supported_attribution_and_sharealike_licenses(self):
        for kind in ['BY','BY-SA']:
            for version in ['1.0','2.0','2.5','3.0','4.0']:
                url=f'https://creativecommons.org/licenses/{kind.lower()}/{version}/'
                checked=module.license_details(metadata(f'CC {kind} {version}',url))
                self.assertEqual(checked['code'],f'CC-{kind}-{version}')
                self.assertTrue(checked['attributionRequired'])
    def test_public_domain_is_not_assumed_from_an_empty_license(self):
        self.assertEqual(module.license_details(metadata('Public domain',copyrighted='False'))['code'],'Public-Domain')
        for data in [metadata('Public domain'),metadata(''),metadata('Copyrighted free use')]:
            with self.assertRaises(ValueError): module.license_details(data)
    def test_cc0_official_deed_urls_and_plain_text(self):
        for suffix in ['', '/', '/deed.en', '/legalcode']:
            self.assertEqual(module.license_details(metadata('CC0','https://creativecommons.org/publicdomain/zero/1.0'+suffix))['code'],'CC0-1.0')
        self.assertEqual(module.plain('<a href="https://example.org">A &amp; B</a><br>Photographers'),'A & B Photographers')
    def test_restrictive_unknown_mismatched_and_missing_credit_are_rejected(self):
        for data in [metadata('GFDL'),metadata('CC BY-NC 4.0'),metadata('CC BY-ND 4.0'),
            metadata('CC BY 4.0','https://example.org/'),metadata('CC BY 4.0','https://creativecommons.org/licenses/by-sa/4.0/'),
            metadata('CC BY 4.0','https://creativecommons.org/licenses/by/4.0/',artist=''),
            metadata('CC BY 4.0','https://creativecommons.org/licenses/by/4.0/',artist='Unknown author'),
            metadata('CC0','https://example.org/publicdomain/zero/1.0/')]:
            with self.assertRaises(ValueError): module.license_details(data)

if __name__=='__main__':unittest.main()

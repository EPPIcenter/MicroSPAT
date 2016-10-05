import csv


class CaseInsensitiveDict(dict):
    """
    Dict that removes whitespace, replaces inner spaces with underscores, removes periods, and is
    case insensitive.
    """

    def __getitem__(self, item):
        return dict.__getitem__(self, item.strip().replace(' ', '_').replace('.', '').lower())


class CaseInsensitiveDictReader(csv.DictReader, object):
    """
    DictReader that uses case insensitive dict, removes periods, and converts fieldnames to snake_case
    """

    @property
    def fieldnames(self):
        return [field.strip().replace(' ', '_').replace('.', '').lower() for field in super(CaseInsensitiveDictReader, self).fieldnames]

    def __next__(self):
        d_insensitive = CaseInsensitiveDict()
        d_original = super(CaseInsensitiveDictReader, self).__next__()

        for k, v in d_original.items():
            d_insensitive[k] = v

        return d_insensitive


# from app import celery
# from fsa_extractor.PlateExtractor import PlateExtractor

# @celery.task
# def process_plate_zip(zip_location, ladder):
#     with open(zip_location, 'rb') as zf:
#         plate = PlateExtractor.from_zip_and_calculate_base_sizes(zf, ladder.base_sizes, ladder.color,
#                                                                  ladder.base_size_precision, ladder.sq_limit,
#                                                                  ladder.filter_parameters, ladder.scanning_parameters)

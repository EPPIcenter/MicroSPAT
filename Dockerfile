FROM python:2.7-slim
MAINTAINER Maxwell Murphy <murphy2122@gmail.com>

ENV INSTALL_PATH /microspat

RUN mkdir -p $INSTALL_PATH
WORKDIR $INSTALL_PATH
COPY requirements.txt requirements.txt
RUN pip install -r requirements.txt
COPY . .
RUN python manage.py initDB
CMD python manage.py runsockets -a 0.0.0.0:7000

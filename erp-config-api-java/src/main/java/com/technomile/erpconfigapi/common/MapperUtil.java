package com.technomile.erpconfigapi.common;

import com.technomile.erpconfigapi.dto.ClientDtos.ClientReadDto;
import com.technomile.erpconfigapi.dto.FieldMappingDtos.FieldMappingReadDto;
import com.technomile.erpconfigapi.dto.PipelineDtos.PipelineReadDto;
import com.technomile.erpconfigapi.dto.PipelineStepDtos.PipelineStepReadDto;
import com.technomile.erpconfigapi.dto.StepDtos.StepReadDto;
import com.technomile.erpconfigapi.dto.TargetDtos.TargetReadDto;
import com.technomile.erpconfigapi.entity.*;

public final class MapperUtil {

    private MapperUtil() {
    }

    public static ClientReadDto toClientRead(Client entity) {
        return new ClientReadDto(entity.getClientId(), entity.getClientName(), entity.getIsActive(), entity.getCreatedAt());
    }

    public static TargetReadDto toTargetRead(Target entity) {
        return new TargetReadDto(entity.getTargetId(), entity.getClientId(), entity.getTargetName(), entity.getBaseUrl(),
                entity.getAuthType(), entity.getCredentialRef(), entity.getDefaultHeaders(), entity.getIsActive(), entity.getUpdatedAt());
    }

    public static StepReadDto toStepRead(Step entity) {
        return new StepReadDto(entity.getStepPk(), entity.getClientId(), entity.getTargetId(), entity.getStepName(), entity.getMethod(),
                entity.getPath(), entity.getQueryParams(), entity.getHeaders(), entity.getExtract(), entity.getOnNotFound(),
                entity.getOnMultipleResults(), entity.getRollbackMethod(), entity.getRollbackPath(), entity.getIsActive(), entity.getUpdatedAt());
    }

    public static PipelineReadDto toPipelineRead(Pipeline entity) {
        return new PipelineReadDto(entity.getPipelineId(), entity.getClientId(), entity.getVersion(), entity.getSourceSystem(),
                entity.getObjectType(), entity.getEventType(), entity.getPatternId(), entity.getStatus(), entity.getRetryMaxAttempts(),
                entity.getRetryBackoff(), entity.getRetryBackoffBaseMs(), entity.getRetryOnStatusCodes(), entity.getCreatedAt(), entity.getUpdatedAt());
    }

    public static PipelineStepReadDto toPipelineStepRead(PipelineStep entity) {
        return new PipelineStepReadDto(entity.getPipelineStepPk(), entity.getPipelineId(), entity.getStepPk(), entity.getSeq());
    }

    public static FieldMappingReadDto toFieldMappingRead(FieldMapping entity) {
        return new FieldMappingReadDto(entity.getMappingPk(), entity.getStepPk(), entity.getSourcePath(), entity.getTargetPath(),
                entity.getTransformType(), entity.getTransformParams(), entity.getDefaultValue(), entity.getIsRequired(),
                entity.getSortOrder(), entity.getArraySourcePath(), entity.getArrayTargetPath(), entity.getIsSingletonArray(),
                entity.getIsObjectTarget());
    }
}

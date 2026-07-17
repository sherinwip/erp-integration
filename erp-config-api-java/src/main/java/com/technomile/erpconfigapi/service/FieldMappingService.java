package com.technomile.erpconfigapi.service;

import com.technomile.erpconfigapi.common.AppException;
import com.technomile.erpconfigapi.common.MapperUtil;
import com.technomile.erpconfigapi.dto.FieldMappingDtos.*;
import com.technomile.erpconfigapi.entity.FieldMapping;
import com.technomile.erpconfigapi.repository.FieldMappingRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class FieldMappingService {
    private final FieldMappingRepository fieldMappingRepository;
    private final StepService stepService;

    public FieldMappingService(FieldMappingRepository fieldMappingRepository, StepService stepService) {
        this.fieldMappingRepository = fieldMappingRepository;
        this.stepService = stepService;
    }

    public List<FieldMappingReadDto> list(Long stepPk, int skip, int limit) {
        if (stepPk != null) {
            return fieldMappingRepository.findByStepPkOrderByArrayTargetPathAscSortOrderAsc(stepPk).stream().map(MapperUtil::toFieldMappingRead).toList();
        }
        int page = limit > 0 ? skip / limit : 0;
        return fieldMappingRepository.findAll(PageRequest.of(page, Math.max(limit, 1))).stream().map(MapperUtil::toFieldMappingRead).toList();
    }

    public FieldMappingReadDto create(FieldMappingCreateDto payload) {
        stepService.findEntity(payload.step_pk());
        String arrayTargetPath = payload.array_target_path() == null ? "" : payload.array_target_path();
        ensureNotMapped(payload.step_pk(), arrayTargetPath, payload.target_path());

        FieldMapping entity = fromCreate(payload);
        entity.setArrayTargetPath(arrayTargetPath);
        return MapperUtil.toFieldMappingRead(fieldMappingRepository.save(entity));
    }

    public List<FieldMappingReadDto> createBulk(FieldMappingBulkCreateDto payload) {
        stepService.findEntity(payload.step_pk());
        Set<String> seen = new HashSet<>();
        List<FieldMapping> toCreate = new ArrayList<>();

        for (FieldMappingBulkRowDto row : payload.mappings()) {
            String arrayTargetPath = row.array_target_path() == null ? "" : row.array_target_path();
            String key = arrayTargetPath + "|" + row.target_path();
            if (!seen.add(key)) {
                throw new AppException(HttpStatus.CONFLICT, "Conflict",
                        "target_path '" + row.target_path() + "' duplicated in request body for array '" + arrayTargetPath + "'");
            }
            ensureNotMapped(payload.step_pk(), arrayTargetPath, row.target_path());

            FieldMapping entity = new FieldMapping();
            entity.setStepPk(payload.step_pk());
            entity.setSourcePath(row.source_path());
            entity.setTargetPath(row.target_path());
            entity.setTransformType(row.transform_type() == null ? "none" : row.transform_type());
            entity.setTransformParams(row.transform_params());
            entity.setDefaultValue(row.default_value());
            entity.setIsRequired(row.is_required() == null ? Boolean.FALSE : row.is_required());
            entity.setSortOrder(row.sort_order() == null ? 0 : row.sort_order());
            entity.setArraySourcePath(row.array_source_path() == null ? "" : row.array_source_path());
            entity.setArrayTargetPath(arrayTargetPath);
            entity.setIsSingletonArray(row.is_singleton_array() == null ? Boolean.FALSE : row.is_singleton_array());
            entity.setIsObjectTarget(row.is_object_target() == null ? Boolean.FALSE : row.is_object_target());
            toCreate.add(entity);
        }

        return fieldMappingRepository.saveAll(toCreate).stream().map(MapperUtil::toFieldMappingRead).toList();
    }

    public FieldMappingReadDto get(Long mappingPk) {
        return MapperUtil.toFieldMappingRead(findEntity(mappingPk));
    }

    public FieldMappingReadDto update(Long mappingPk, FieldMappingUpdateDto payload) {
        FieldMapping entity = findEntity(mappingPk);
        if (payload.source_path() != null) entity.setSourcePath(payload.source_path());
        if (payload.target_path() != null) entity.setTargetPath(payload.target_path());
        if (payload.transform_type() != null) entity.setTransformType(payload.transform_type());
        if (payload.transform_params() != null) entity.setTransformParams(payload.transform_params());
        if (payload.default_value() != null) entity.setDefaultValue(payload.default_value());
        if (payload.is_required() != null) entity.setIsRequired(payload.is_required());
        if (payload.sort_order() != null) entity.setSortOrder(payload.sort_order());
        if (payload.array_source_path() != null) entity.setArraySourcePath(payload.array_source_path());
        if (payload.array_target_path() != null) entity.setArrayTargetPath(payload.array_target_path());
        if (payload.is_singleton_array() != null) entity.setIsSingletonArray(payload.is_singleton_array());
        if (payload.is_object_target() != null) entity.setIsObjectTarget(payload.is_object_target());
        return MapperUtil.toFieldMappingRead(fieldMappingRepository.save(entity));
    }

    public void delete(Long mappingPk) {
        fieldMappingRepository.delete(findEntity(mappingPk));
    }

    private void ensureNotMapped(Long stepPk, String arrayTargetPath, String targetPath) {
        if (fieldMappingRepository.findByStepPkAndArrayTargetPathAndTargetPath(stepPk, arrayTargetPath, targetPath).isPresent()) {
            throw new AppException(HttpStatus.CONFLICT, "Conflict",
                    "target_path '" + targetPath + "' already mapped for step " + stepPk + " in array '" + arrayTargetPath + "'");
        }
    }

    private FieldMapping fromCreate(FieldMappingCreateDto payload) {
        FieldMapping entity = new FieldMapping();
        entity.setStepPk(payload.step_pk());
        entity.setSourcePath(payload.source_path());
        entity.setTargetPath(payload.target_path());
        entity.setTransformType(payload.transform_type() == null ? "none" : payload.transform_type());
        entity.setTransformParams(payload.transform_params());
        entity.setDefaultValue(payload.default_value());
        entity.setIsRequired(payload.is_required() == null ? Boolean.FALSE : payload.is_required());
        entity.setSortOrder(payload.sort_order() == null ? 0 : payload.sort_order());
        entity.setArraySourcePath(payload.array_source_path() == null ? "" : payload.array_source_path());
        entity.setArrayTargetPath(payload.array_target_path() == null ? "" : payload.array_target_path());
        entity.setIsSingletonArray(payload.is_singleton_array() == null ? Boolean.FALSE : payload.is_singleton_array());
        entity.setIsObjectTarget(payload.is_object_target() == null ? Boolean.FALSE : payload.is_object_target());
        return entity;
    }

    private FieldMapping findEntity(Long mappingPk) {
        return fieldMappingRepository.findById(mappingPk)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "NotFound", "FieldMapping '" + mappingPk + "' not found"));
    }
}

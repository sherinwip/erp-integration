package com.technomile.erpconfigapi.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public class FieldMappingDtos {
    public record FieldMappingCreateDto(
            @NotNull Long step_pk,
            @NotBlank @Size(max = 200) String source_path,
            @NotBlank @Size(max = 200) String target_path,
            @Size(max = 50) String transform_type,
            @Size(max = 500) String transform_params,
            @Size(max = 500) String default_value,
            Boolean is_required,
            Integer sort_order,
            @Size(max = 200) String array_source_path,
            @Size(max = 200) String array_target_path,
            Boolean is_singleton_array,
            Boolean is_object_target
    ) {
    }

    public record FieldMappingUpdateDto(
            @Size(max = 200) String source_path,
            @Size(max = 200) String target_path,
            @Size(max = 50) String transform_type,
            @Size(max = 500) String transform_params,
            @Size(max = 500) String default_value,
            Boolean is_required,
            Integer sort_order,
            @Size(max = 200) String array_source_path,
            @Size(max = 200) String array_target_path,
            Boolean is_singleton_array,
            Boolean is_object_target
    ) {
    }

    public record FieldMappingBulkRowDto(
            @NotBlank @Size(max = 200) String source_path,
            @NotBlank @Size(max = 200) String target_path,
            @Size(max = 50) String transform_type,
            @Size(max = 500) String transform_params,
            @Size(max = 500) String default_value,
            Boolean is_required,
            Integer sort_order,
            @Size(max = 200) String array_source_path,
            @Size(max = 200) String array_target_path,
            Boolean is_singleton_array,
            Boolean is_object_target
    ) {
    }

    public record FieldMappingBulkCreateDto(
            @NotNull Long step_pk,
            @NotNull @Valid List<FieldMappingBulkRowDto> mappings
    ) {
    }

    public record FieldMappingReadDto(
            Long mapping_pk,
            Long step_pk,
            String source_path,
            String target_path,
            String transform_type,
            String transform_params,
            String default_value,
            Boolean is_required,
            Integer sort_order,
            String array_source_path,
            String array_target_path,
            Boolean is_singleton_array,
            Boolean is_object_target
    ) {
    }
}
